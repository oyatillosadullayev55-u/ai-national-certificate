import {
  ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttemptStatus, ExamAttempt, Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import { evaluateAnswer } from '../answer-evaluation/answer-evaluation';
import { PrismaService } from '../common/prisma/prisma.service';
import { toReviewView, toStudentView, versionWithOptions } from '../questions/question-view';
import { SaveAnswerDto } from './exam.dto';
import { TestsService } from './tests.service';

const MASTERY_ALPHA = 0.3; // mavzu o'zlashtirishini eksponensial silliqlash koeffitsienti

@Injectable()
export class ExamEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExamEngineService.name);
  private sweeper?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tests: TestsService,
    private readonly config: ConfigService,
  ) {}

  private get graceMs() {
    return this.config.get<number>('exam.graceSec')! * 1000;
  }

  // Vaqti tugagan, lekin yakunlanmagan urinishlarni avtomatik yopish.
  // Ko'p instansiyada ishlatishda BullMQ repeatable job'ga ko'chiring.
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.sweeper = setInterval(() => this.sweepExpired().catch((e) => this.logger.error(e)), 60_000);
  }

  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  async sweepExpired() {
    const expired = await this.prisma.examAttempt.findMany({
      where: { status: 'IN_PROGRESS', deadlineAt: { lt: new Date(Date.now() - this.graceMs) } },
      select: { id: true },
      take: 200,
    });
    for (const a of expired) await this.finalize(a.id, 'EXPIRED');
    if (expired.length) this.logger.log(`${expired.length} ta muddati o'tgan urinish yakunlandi`);
  }

  // ───────────── Start / Resume ─────────────

  async start(userId: string, testId: string) {
    const test = await this.tests.getRaw(testId);
    await this.tests.assertCanTake(userId, test);

    // Tugallanmagan urinish bo'lsa — davom ettiriladi (sessiyani tiklash)
    const existing = await this.prisma.examAttempt.findFirst({ where: { testId, userId, status: 'IN_PROGRESS' } });
    if (existing && !(await this.expireIfNeeded(existing))) return this.view(userId, existing.id);

    const tq = await this.prisma.testQuestion.findMany({ where: { testId }, orderBy: { sortOrder: 'asc' }, select: { questionVersionId: true } });
    if (tq.length === 0) throw new ConflictException('Testda savollar yo\'q');
    const order = tq.map((q) => q.questionVersionId);
    if (test.shuffle) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = randomInt(0, i + 1);
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    const now = new Date();
    const attempt = await this.prisma.examAttempt.create({
      data: {
        testId, userId, questionOrder: order, startedAt: now,
        deadlineAt: test.durationSec ? new Date(now.getTime() + test.durationSec * 1000) : null,
      },
    });
    return this.view(userId, attempt.id);
  }

  // ───────────── View ─────────────

  async view(userId: string, attemptId: string) {
    const attempt = await this.own(userId, attemptId);
    await this.expireIfNeeded(attempt);
    const fresh = await this.prisma.examAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { answers: { select: { questionVersionId: true, response: true, flagged: true, updatedAt: true } }, test: { select: { title: true, mode: true } } },
    });
    const order = fresh.questionOrder as string[];
    const versions = await this.prisma.questionVersion.findMany({ where: { id: { in: order } }, include: versionWithOptions });
    const byId = new Map(versions.map((v) => [v.id, v]));

    return {
      id: fresh.id,
      testId: fresh.testId,
      title: fresh.test.title,
      mode: fresh.test.mode,
      status: fresh.status,
      startedAt: fresh.startedAt,
      deadlineAt: fresh.deadlineAt,
      serverTime: new Date(),
      remainingSec: fresh.deadlineAt ? Math.max(0, Math.floor((fresh.deadlineAt.getTime() - Date.now()) / 1000)) : null,
      questions: order.map((id, i) => ({ index: i + 1, ...toStudentView(byId.get(id)!) })),
      answers: fresh.answers,
    };
  }

  // ───────────── Save answer (idempotent) ─────────────

  async saveAnswer(userId: string, attemptId: string, questionVersionId: string, dto: SaveAnswerDto) {
    const attempt = await this.own(userId, attemptId);
    if (attempt.status !== 'IN_PROGRESS') throw new ConflictException('Urinish yakunlangan');
    if (await this.expireIfNeeded(attempt)) throw new ConflictException('Vaqt tugadi, urinish yakunlandi');
    if (!(attempt.questionOrder as string[]).includes(questionVersionId)) throw new NotFoundException('Savol bu testda yo\'q');

    const clientUpdatedAt = dto.clientUpdatedAt ? new Date(dto.clientUpdatedAt) : null;
    const existing = await this.prisma.answer.findUnique({ where: { attemptId_questionVersionId: { attemptId, questionVersionId } } });
    // Offline navbatdan kech kelgan eski javob yangisini bosib ketmaydi
    if (existing?.clientUpdatedAt && clientUpdatedAt && clientUpdatedAt < existing.clientUpdatedAt) {
      return { saved: false, stale: true, updatedAt: existing.updatedAt };
    }

    const data = {
      response: (dto.response ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      flagged: dto.flagged ?? existing?.flagged ?? false,
      timeSpentMs: dto.timeSpentMs ?? existing?.timeSpentMs ?? 0,
      clientUpdatedAt,
    };
    const a = await this.prisma.answer.upsert({
      where: { attemptId_questionVersionId: { attemptId, questionVersionId } },
      create: { attemptId, questionVersionId, ...data },
      update: data,
    });
    return { saved: true, stale: false, updatedAt: a.updatedAt };
  }

  // ───────────── Submit (idempotent) ─────────────

  async submit(userId: string, attemptId: string) {
    await this.own(userId, attemptId);
    await this.finalize(attemptId, 'SUBMITTED');
    return this.result(userId, attemptId);
  }

  /**
   * Urinishni yakunlaydi va baholaydi. Faqat IN_PROGRESS holatdan bir marta o'tadi —
   * qayta chaqiruv yoki parallel so'rov hech narsani ikki marta hisoblamaydi.
   */
  async finalize(attemptId: string, status: Exclude<AttemptStatus, 'IN_PROGRESS'>) {
    await this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.examAttempt.updateMany({
          where: { id: attemptId, status: 'IN_PROGRESS' },
          data: { status, submittedAt: new Date() },
        });
        if (claimed.count === 0) return; // allaqachon yakunlangan

        const attempt = await tx.examAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { test: true } });
        const order = attempt.questionOrder as string[];
        const [versions, testQuestions, answers] = await Promise.all([
          tx.questionVersion.findMany({ where: { id: { in: order } }, include: versionWithOptions }),
          tx.testQuestion.findMany({ where: { testId: attempt.testId } }),
          tx.answer.findMany({ where: { attemptId } }),
        ]);
        const pointsOf = new Map(testQuestions.map((t) => [t.questionVersionId, Number(t.points)]));
        const answerOf = new Map(answers.map((a) => [a.questionVersionId, a]));

        let score = 0;
        let maxScore = 0;
        let correctCount = 0;
        const topicStats = new Map<string, { answered: number; correct: number }>();
        const now = new Date();

        for (const v of versions) {
          const pts = pointsOf.get(v.id) ?? Number(v.points);
          maxScore += pts;
          const ans = answerOf.get(v.id);
          if (!ans) continue;

          const r = evaluateAnswer({ type: v.question.type, options: v.options, answerKey: v.answerKey }, ans.response);
          const earned = Math.round(r.fraction * pts * 100) / 100;
          score += earned;
          if (r.isCorrect) correctCount++;
          await tx.answer.update({ where: { id: ans.id }, data: { isCorrect: r.isCorrect, points: earned } });

          if (r.isCorrect === null) continue; // qo'lda tekshiriladi

          // IRT kalibrlash uchun statistika
          await tx.questionStatistic.upsert({
            where: { versionId: v.id },
            create: { versionId: v.id, attempts: 1, correct: r.isCorrect ? 1 : 0, totalTimeMs: ans.timeSpentMs },
            update: { attempts: { increment: 1 }, correct: { increment: r.isCorrect ? 1 : 0 }, totalTimeMs: { increment: ans.timeSpentMs } },
          });

          const ts = topicStats.get(v.question.topicId) ?? { answered: 0, correct: 0 };
          ts.answered++;
          if (r.isCorrect) ts.correct++;
          topicStats.set(v.question.topicId, ts);

          // Smart Error Notebook: xato avtomatik saqlanadi
          if (!r.isCorrect) {
            await tx.errorNotebookEntry.upsert({
              where: { userId_questionVersionId: { userId: attempt.userId, questionVersionId: v.id } },
              create: {
                userId: attempt.userId, questionVersionId: v.id, lastAttemptId: attemptId,
                reason: ans.timeSpentMs > 0 && ans.timeSpentMs < 5000 ? 'CARELESS' : 'UNKNOWN',
                nextReviewAt: new Date(now.getTime() + 86_400_000),
              },
              update: {
                wrongCount: { increment: 1 }, status: 'OPEN', repetitions: 0, intervalDays: 1, lastAttemptId: attemptId,
                nextReviewAt: new Date(now.getTime() + 86_400_000),
              },
            });
          }
        }

        // Mavzu bo'yicha o'zlashtirish (Knowledge Map uchun)
        for (const [topicId, s] of topicStats) {
          const acc = s.correct / s.answered;
          const prev = await tx.studentProgress.findUnique({ where: { userId_topicId: { userId: attempt.userId, topicId } } });
          const mastery = prev ? prev.mastery * (1 - MASTERY_ALPHA) + acc * MASTERY_ALPHA : acc;
          await tx.studentProgress.upsert({
            where: { userId_topicId: { userId: attempt.userId, topicId } },
            create: { userId: attempt.userId, topicId, answered: s.answered, correct: s.correct, mastery },
            update: { answered: { increment: s.answered }, correct: { increment: s.correct }, mastery },
          });
        }

        await tx.examAttempt.update({
          where: { id: attemptId },
          data: { score: Math.round(score * 100) / 100, maxScore, correctCount },
        });
      },
      { timeout: 30_000 },
    );
  }

  // ───────────── Result ─────────────

  async result(userId: string, attemptId: string) {
    const attempt = await this.own(userId, attemptId, true);
    if (attempt.status === 'IN_PROGRESS') {
      if (!(await this.expireIfNeeded(attempt))) throw new ConflictException('Test hali yakunlanmagan');
    }
    const a = await this.prisma.examAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { answers: true, test: { select: { title: true, mode: true, subjectId: true } } },
    });
    const order = a.questionOrder as string[];
    const versions = await this.prisma.questionVersion.findMany({
      where: { id: { in: order } },
      include: { ...versionWithOptions, question: { select: { id: true, type: true, topicId: true, subjectId: true, topic: { select: { name: true } } } } },
    });
    const byId = new Map(versions.map((v) => [v.id, v]));
    const answerOf = new Map(a.answers.map((x) => [x.questionVersionId, x]));

    const byTopic = new Map<string, { topicId: string; topicName: string; total: number; correct: number; timeMs: number }>();
    const questions = order.map((id, i) => {
      const v = byId.get(id)!;
      const ans = answerOf.get(id);
      const t = byTopic.get(v.question.topicId) ?? { topicId: v.question.topicId, topicName: v.question.topic.name, total: 0, correct: 0, timeMs: 0 };
      t.total++;
      if (ans?.isCorrect) t.correct++;
      t.timeMs += ans?.timeSpentMs ?? 0;
      byTopic.set(v.question.topicId, t);
      return {
        index: i + 1,
        ...toReviewView(v),
        yourResponse: ans?.response ?? null,
        isCorrect: ans ? ans.isCorrect : false,
        earnedPoints: ans?.points ? Number(ans.points) : 0,
        timeSpentMs: ans?.timeSpentMs ?? 0,
      };
    });

    const totalTimeMs = a.answers.reduce((s, x) => s + x.timeSpentMs, 0);
    return {
      id: a.id,
      title: a.test.title,
      mode: a.test.mode,
      status: a.status,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      score: Number(a.score ?? 0),
      maxScore: Number(a.maxScore ?? 0),
      percent: a.maxScore && Number(a.maxScore) > 0 ? Math.round((Number(a.score) / Number(a.maxScore)) * 1000) / 10 : 0,
      correctCount: a.correctCount ?? 0,
      totalQuestions: order.length,
      unanswered: order.length - a.answers.length,
      pendingManualReview: a.answers.filter((x) => x.isCorrect === null).length,
      avgTimePerQuestionSec: order.length ? Math.round(totalTimeMs / order.length / 100) / 10 : 0,
      topics: [...byTopic.values()].map((t) => ({ ...t, accuracy: Math.round((t.correct / t.total) * 100) })),
      // PRD 3.14: rasmiy ball ekvivalenti sifatida ko'rsatilmaydi
      disclaimer: 'Bu platformadagi mashq natijasi. Rasmiy milliy sertifikat bali emas.',
      questions,
    };
  }

  async myAttempts(userId: string) {
    return this.prisma.examAttempt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, status: true, score: true, maxScore: true, correctCount: true, startedAt: true, submittedAt: true,
        test: { select: { id: true, title: true, mode: true, subjectId: true } },
      },
    });
  }

  /** Foydalanuvchida davom etayotgan imtihon bormi (AI Tutor bloklash uchun) */
  async hasActiveControlledExam(userId: string): Promise<boolean> {
    const n = await this.prisma.examAttempt.count({
      where: {
        userId, status: 'IN_PROGRESS',
        test: { mode: { in: ['MOCK_EXAM', 'TEACHER_ASSIGNMENT', 'DIAGNOSTIC'] } },
        OR: [{ deadlineAt: null }, { deadlineAt: { gt: new Date(Date.now() - this.graceMs) } }],
      },
    });
    return n > 0;
  }

  // ───────────── helpers ─────────────

  private async own(userId: string, attemptId: string, allowViewers = false): Promise<ExamAttempt> {
    const a = await this.prisma.examAttempt.findUnique({ where: { id: attemptId } });
    if (!a) throw new NotFoundException('Urinish topilmadi');
    if (a.userId !== userId && !allowViewers) throw new ForbiddenException();
    if (a.userId !== userId) {
      // Natijani o'qituvchi/ota-ona ham ko'ra oladi — resurs darajasidagi tekshiruv
      const ok =
        (await this.prisma.parentStudentLink.count({ where: { parentId: userId, studentId: a.userId, status: 'ACTIVE' } })) > 0 ||
        (await this.prisma.groupMember.count({ where: { studentId: a.userId, group: { teachers: { some: { teacherId: userId } } } } })) > 0;
      if (!ok) throw new ForbiddenException();
    }
    return a;
  }

  /** Vaqt serverda hisoblanadi: deadline + grace o'tgan bo'lsa urinish yopiladi */
  private async expireIfNeeded(a: ExamAttempt): Promise<boolean> {
    if (a.status !== 'IN_PROGRESS' || !a.deadlineAt) return a.status !== 'IN_PROGRESS';
    if (Date.now() > a.deadlineAt.getTime() + this.graceMs) {
      await this.finalize(a.id, 'EXPIRED');
      return true;
    }
    return false;
  }
}
