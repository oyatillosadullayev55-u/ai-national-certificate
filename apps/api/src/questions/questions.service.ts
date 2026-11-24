import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentStatus, Prisma } from '@prisma/client';
import { validateQuestionShape } from '../answer-evaluation/answer-evaluation';
import { AccessService } from '../common/access/access.service';
import { AuditService } from '../common/audit/audit.service';
import { pageArgs, paged } from '../common/http';
import { P } from '../common/permissions';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateQuestionDto, QuestionQueryDto, QuestionVersionDto, ReviewDto } from './questions.dto';

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, dto: CreateQuestionDto, initialStatus: ContentStatus = 'DRAFT') {
    await this.access.assertPermission(userId, P.questionsCreate, dto.organizationId);
    this.assertShape(dto.type, dto);

    const topic = await this.prisma.topic.findFirst({ where: { id: dto.topicId, subjectId: dto.subjectId, deletedAt: null } });
    if (!topic) throw new BadRequestException('Mavzu ushbu fanga tegishli emas');

    return this.prisma.$transaction(async (tx) => {
      const q = await tx.question.create({
        data: {
          subjectId: dto.subjectId, topicId: dto.topicId, objectiveId: dto.objectiveId, organizationId: dto.organizationId,
          type: dto.type, status: initialStatus, authorId: userId, source: dto.source, copyrightStatus: dto.copyrightStatus,
        },
      });
      await tx.questionVersion.create({ data: this.versionData(q.id, 1, userId, dto, initialStatus) });
      return tx.question.findUniqueOrThrow({ where: { id: q.id }, include: { versions: { include: { options: true } } } });
    });
  }

  /** Tasdiqlangan versiya hech qachon o'zgartirilmaydi — har tahrir yangi versiya */
  async update(userId: string, questionId: string, dto: QuestionVersionDto) {
    const q = await this.getRaw(questionId);
    await this.assertCanEdit(userId, q);
    this.assertShape(q.type, dto);

    const last = await this.prisma.questionVersion.findFirstOrThrow({ where: { questionId }, orderBy: { version: 'desc' } });
    const version = await this.prisma.questionVersion.create({
      data: this.versionData(questionId, last.version + 1, userId, dto, 'DRAFT'),
      include: { options: true },
    });
    if (q.status !== 'APPROVED') await this.prisma.question.update({ where: { id: questionId }, data: { status: 'DRAFT' } });
    return version;
  }

  async submitForReview(userId: string, questionId: string) {
    const q = await this.getRaw(questionId);
    await this.assertCanEdit(userId, q);
    const draft = await this.prisma.questionVersion.findFirst({
      where: { questionId, status: { in: ['DRAFT', 'REJECTED'] } },
      orderBy: { version: 'desc' },
    });
    if (!draft) throw new BadRequestException('Tekshiruvga yuboriladigan qoralama versiya yo\'q');
    await this.prisma.$transaction([
      this.prisma.questionVersion.update({ where: { id: draft.id }, data: { status: 'IN_REVIEW' } }),
      ...(q.status !== 'APPROVED' ? [this.prisma.question.update({ where: { id: questionId }, data: { status: 'IN_REVIEW' } })] : []),
    ]);
    return { versionId: draft.id, status: 'IN_REVIEW' };
  }

  async review(reviewerId: string, questionId: string, dto: ReviewDto) {
    const version = await this.prisma.questionVersion.findFirst({ where: { id: dto.versionId, questionId } });
    if (!version) throw new NotFoundException('Versiya topilmadi');
    if (version.status !== 'IN_REVIEW') throw new BadRequestException('Versiya tekshiruv navbatida emas');
    // To'rt ko'z prinsipi: muallif o'z savolini tasdiqlay olmaydi
    if (version.createdById === reviewerId) throw new ForbiddenException('Muallif o\'z savolini tasdiqlay olmaydi');

    await this.prisma.$transaction(async (tx) => {
      await tx.questionReview.create({ data: { versionId: version.id, reviewerId, decision: dto.decision, comment: dto.comment } });

      if (dto.decision === 'APPROVE') {
        const q = await tx.question.findUniqueOrThrow({ where: { id: questionId } });
        if (q.currentVersionId) {
          await tx.questionVersion.update({ where: { id: q.currentVersionId }, data: { status: 'ARCHIVED' } });
        }
        await tx.questionVersion.update({ where: { id: version.id }, data: { status: 'APPROVED' } });
        await tx.question.update({ where: { id: questionId }, data: { status: 'APPROVED', currentVersionId: version.id } });
      } else {
        const next: ContentStatus = dto.decision === 'REJECT' ? 'REJECTED' : 'DRAFT';
        await tx.questionVersion.update({ where: { id: version.id }, data: { status: next } });
        const q = await tx.question.findUniqueOrThrow({ where: { id: questionId } });
        if (q.status !== 'APPROVED') await tx.question.update({ where: { id: questionId }, data: { status: next } });
      }
      await this.audit.log(
        { actorId: reviewerId, action: `question.review.${dto.decision.toLowerCase()}`, entityType: 'question_version', entityId: version.id },
        tx,
      );
    });
    return this.get(reviewerId, questionId);
  }

  /** Import: savollar avtomatik nashr qilinmaydi — tekshiruv navbatiga tushadi */
  async import(userId: string, items: CreateQuestionDto[]) {
    const created: string[] = [];
    const errors: { index: number; message: string }[] = [];
    for (const [index, item] of items.entries()) {
      try {
        const q = await this.create(userId, item, 'IN_REVIEW');
        created.push(q.id);
      } catch (e) {
        errors.push({ index, message: (e as Error).message });
      }
    }
    await this.audit.log({ actorId: userId, action: 'question.import', entityType: 'question', meta: { created: created.length, failed: errors.length } });
    return { created: created.length, failed: errors.length, errors };
  }

  async list(userId: string, q: QuestionQueryDto) {
    const where: Prisma.QuestionWhereInput = {
      deletedAt: null,
      subjectId: q.subjectId,
      topicId: q.topicId,
      status: q.status,
      type: q.type,
      ...(q.q ? { versions: { some: { stem: { contains: q.q, mode: 'insensitive' } } } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.question.findMany({
        where, ...pageArgs(q), orderBy: { updatedAt: 'desc' },
        include: { versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true, version: true, stem: true, status: true, difficulty: true } } },
      }),
      this.prisma.question.count({ where }),
    ]);
    return paged(items, total, q);
  }

  reviewQueue(q: QuestionQueryDto) {
    const where: Prisma.QuestionVersionWhereInput = { status: 'IN_REVIEW', question: { subjectId: q.subjectId, deletedAt: null } };
    return this.prisma.questionVersion
      .findMany({
        where,
        ...pageArgs(q),
        orderBy: { createdAt: 'asc' },
        include: { options: true, question: { select: { id: true, type: true, subjectId: true, topicId: true, authorId: true } } },
      })
      .then(async (items) => paged(items, await this.prisma.questionVersion.count({ where }), q));
  }

  async get(userId: string, id: string) {
    const canSeeKeys = await this.access.hasPermission(userId, P.questionsReadKeys);
    const q = await this.prisma.question.findFirst({
      where: { id, deletedAt: null },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: { options: { orderBy: { sortOrder: 'asc' } }, assets: true, reviews: { orderBy: { createdAt: 'desc' } }, statistic: true },
        },
      },
    });
    if (!q) throw new NotFoundException('Savol topilmadi');
    if (!canSeeKeys && q.authorId !== userId) {
      q.versions = q.versions.map((v) => ({
        ...v, answerKey: null, solution: null, explanation: null,
        options: v.options.map((o) => ({ ...o, isCorrect: false })),
      }));
    }
    return q;
  }

  async remove(userId: string, id: string) {
    const q = await this.getRaw(id);
    await this.assertCanEdit(userId, q);
    await this.prisma.question.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
    return { ok: true };
  }

  // ───────────── helpers ─────────────

  private async getRaw(id: string) {
    const q = await this.prisma.question.findFirst({ where: { id, deletedAt: null } });
    if (!q) throw new NotFoundException('Savol topilmadi');
    return q;
  }

  private async assertCanEdit(userId: string, q: { authorId: string; organizationId: string | null }) {
    if (q.authorId === userId) return;
    await this.access.assertPermission(userId, P.questionsCreate, q.organizationId);
  }

  private assertShape(type: CreateQuestionDto['type'], dto: QuestionVersionDto) {
    const errors = validateQuestionShape(type, dto.options, dto.answerKey, dto.payload);
    if (errors.length) throw new BadRequestException({ message: errors });
  }

  private versionData(questionId: string, version: number, userId: string, dto: QuestionVersionDto, status: ContentStatus) {
    return {
      questionId, version, status, createdById: userId,
      stem: dto.stem,
      payload: (dto.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      answerKey: (dto.answerKey ?? undefined) as Prisma.InputJsonValue | undefined,
      solution: dto.solution,
      explanation: dto.explanation,
      difficulty: dto.difficulty ?? 3,
      points: dto.points ?? 1,
      options: dto.options?.length
        ? { create: dto.options.map((o, i) => ({ label: o.label, content: o.content, isCorrect: !!o.isCorrect, sortOrder: i })) }
        : undefined,
    } satisfies Prisma.QuestionVersionUncheckedCreateInput;
  }
}
