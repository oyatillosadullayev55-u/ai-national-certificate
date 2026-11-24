import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Prisma, QuestionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator';
import { AccessService } from '../common/access/access.service';
import { AuthUser, CurrentUser } from '../common/decorators';
import { P } from '../common/permissions';
import { PrismaService } from '../common/prisma/prisma.service';
import { ExamEngineService } from '../exam/exam-engine.service';
import { QuestionsService } from '../questions/questions.service';
import { AiGatewayClient, assertDailyAiLimit, EngineUsage } from './ai-gateway.client';

const GENERATABLE = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'NUMERIC'] as const;
type GeneratableType = (typeof GENERATABLE)[number];
/** Generatsiya va reja ko'p fikrlashni talab qiladi — oddiy chatdan uzunroq kutamiz */
const LONG_TIMEOUT_MS = 180_000;

// ───────────── DTO ─────────────

export class GenerateQuestionsDto {
  @ApiProperty() @IsUUID() subjectId: string;
  @ApiProperty() @IsUUID() topicId: string;
  @ApiProperty({ enum: GENERATABLE }) @IsIn(GENERATABLE) type: GeneratableType;
  @ApiPropertyOptional({ minimum: 1, maximum: 10, default: 5 }) @IsOptional() @IsInt() @Min(1) @Max(10) count?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 5, default: 3 }) @IsOptional() @IsInt() @Min(1) @Max(5) difficulty?: number;
  @ApiPropertyOptional({ description: 'Muallif uchun qo\'shimcha ko\'rsatma' }) @IsOptional() @IsString() @MaxLength(1000) instructions?: string;
}

export class GeneratedOptionDto {
  @ApiProperty() @IsString() @Length(1, 4) label: string;
  @ApiProperty() @IsString() @Length(1, 2000) content: string;
  @ApiProperty() @IsBoolean() isCorrect: boolean;
}

export class GeneratedQuestionDto {
  @ApiProperty() @IsString() @Length(1, 10000) stem: string;
  @ApiProperty({ type: [GeneratedOptionDto] })
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => GeneratedOptionDto) options: GeneratedOptionDto[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() numericValue?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trueFalseValue?: boolean | null;
  @ApiProperty() @IsString() @MaxLength(20000) solution: string;
  @ApiProperty() @IsString() @MaxLength(10000) explanation: string;
  @ApiProperty() @IsInt() @Min(1) @Max(5) difficulty: number;
}

export class SaveGeneratedDto {
  @ApiProperty() @IsUUID() subjectId: string;
  @ApiProperty() @IsUUID() topicId: string;
  @ApiProperty({ enum: GENERATABLE }) @IsIn(GENERATABLE) type: GeneratableType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) model?: string;
  @ApiProperty({ type: [GeneratedQuestionDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => GeneratedQuestionDto)
  questions: GeneratedQuestionDto[];
}

export class StudyPlanDto {
  @ApiPropertyOptional({ minimum: 15, maximum: 480 }) @IsOptional() @IsInt() @Min(15) @Max(480) minutesPerDay?: number;
  @ApiPropertyOptional({ description: 'O\'quvchining maqsadi, masalan: "Matematikadan A+"' })
  @IsOptional() @IsString() @MaxLength(500) goal?: string;
}

interface GeneratedQuestion {
  stem: string;
  options: { label: string; content: string; isCorrect: boolean }[];
  numericValue: number | null;
  trueFalseValue: boolean | null;
  solution: string;
  explanation: string;
  difficulty: number;
}

// ───────────── Service ─────────────

@Injectable()
export class AiContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayClient,
    private readonly access: AccessService,
    private readonly questions: QuestionsService,
    private readonly engine: ExamEngineService,
    private readonly config: ConfigService,
  ) {}

  /** AI savol qoralamalarini yaratadi. Bazaga yozmaydi — muallif ko'rib chiqib, keyin saqlaydi. */
  async generateQuestions(userId: string, dto: GenerateQuestionsDto) {
    await this.access.assertPermission(userId, P.questionsCreate);
    const topic = await this.prisma.topic.findFirst({
      where: { id: dto.topicId, subjectId: dto.subjectId, deletedAt: null },
      include: { subject: { select: { nameUz: true } } },
    });
    if (!topic) throw new BadRequestException('Mavzu ushbu fanga tegishli emas');

    // Takrorlanmasligi uchun mavzudagi mavjud savollar matni
    const existing = await this.prisma.questionVersion.findMany({
      where: { question: { topicId: dto.topicId, deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { stem: true },
    });

    const reply = await this.gateway.call<{ questions: GeneratedQuestion[]; model: string; flagged: boolean; usage: EngineUsage }>(
      '/v1/questions/generate',
      {
        locale: 'uz_latn',
        subject: topic.subject.nameUz,
        topic: topic.name,
        topicDescription: topic.description,
        type: dto.type,
        count: dto.count ?? 5,
        difficulty: dto.difficulty ?? 3,
        instructions: dto.instructions,
        existingStems: existing.map((e) => e.stem),
      },
      LONG_TIMEOUT_MS,
    );
    await this.logUsage(userId, 'question_gen', reply.model, reply.usage);
    if (reply.flagged) throw new BadRequestException('Ko\'rsatma xavfsizlik filtridan o\'tmadi. Boshqacha yozib ko\'ring.');
    return { model: reply.model, questions: reply.questions };
  }

  /** Muallif tanlagan (va tahrirlagan) AI savollarini saqlaydi va ekspert tekshiruviga yuboradi */
  async saveGenerated(userId: string, dto: SaveGeneratedDto) {
    const created: string[] = [];
    const errors: { index: number; message: string }[] = [];
    for (const [index, q] of dto.questions.entries()) {
      try {
        const res = await this.questions.create(
          userId,
          {
            subjectId: dto.subjectId,
            topicId: dto.topicId,
            type: dto.type as QuestionType,
            source: `AI (${dto.model ?? 'claude'})`,
            stem: q.stem,
            options: dto.type === 'SINGLE_CHOICE' || dto.type === 'MULTIPLE_CHOICE' ? q.options : undefined,
            answerKey:
              dto.type === 'NUMERIC' ? { value: q.numericValue, tolerance: 0 }
              : dto.type === 'TRUE_FALSE' ? { value: q.trueFalseValue }
              : undefined,
            solution: q.solution,
            explanation: q.explanation,
            difficulty: q.difficulty,
          },
          'IN_REVIEW',
        );
        created.push(res.id);
      } catch (e) {
        const resp = (e as { getResponse?: () => { message?: unknown } }).getResponse?.();
        const msg = Array.isArray(resp?.message) ? resp.message.join('; ') : (e as Error).message;
        errors.push({ index, message: msg });
      }
    }
    return { created: created.length, failed: errors.length, ids: created, errors };
  }

  async getStudyPlan(userId: string) {
    const p = await this.prisma.studentProfile.findUnique({ where: { userId }, select: { studyPlan: true, studyPlanAt: true, dailyMinutes: true } });
    return { plan: p?.studyPlan ?? null, createdAt: p?.studyPlanAt ?? null, minutesPerDay: p?.dailyMinutes ?? null };
  }

  /** O'quvchi ma'lumotlari asosida AI 7 kunlik shaxsiy reja tuzadi va profilda saqlaydi */
  async createStudyPlan(userId: string, dto: StudyPlanDto) {
    if (await this.engine.hasActiveControlledExam(userId)) {
      throw new ForbiddenException('Imtihon davomida AI vaqtincha o\'chirilgan. Testni yakunlagach davom eting.');
    }
    await assertDailyAiLimit(this.prisma, this.config, userId);

    const [user, profile, subjects, weak, attempts, errorsDue] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { locale: true } }),
      this.prisma.studentProfile.findUnique({ where: { userId } }),
      this.prisma.studentSubject.findMany({ where: { userId }, include: { subject: { select: { nameUz: true } } } }),
      this.prisma.studentProgress.findMany({
        where: { userId, answered: { gte: 1 } },
        orderBy: { mastery: 'asc' },
        take: 8,
        include: { topic: { select: { name: true, subject: { select: { nameUz: true } } } } },
      }),
      this.prisma.examAttempt.findMany({
        where: { userId, status: { not: 'IN_PROGRESS' } },
        orderBy: { submittedAt: 'desc' },
        take: 5,
        select: { score: true, maxScore: true, test: { select: { title: true } } },
      }),
      this.prisma.errorNotebookEntry.count({ where: { userId, status: { not: 'RESOLVED' } } }),
    ]);
    if (!user) throw new NotFoundException();

    const minutesPerDay = dto.minutesPerDay ?? profile?.dailyMinutes ?? 60;
    const daysToExam = profile?.examDate ? Math.max(0, Math.ceil((profile.examDate.getTime() - Date.now()) / 86_400_000)) : null;

    const reply = await this.gateway.call<{ plan: Prisma.InputJsonObject; model: string; usage: EngineUsage }>(
      '/v1/study-plan',
      {
        locale: user.locale,
        daysToExam,
        minutesPerDay,
        subjects: subjects.map((s) => s.subject.nameUz),
        weakTopics: weak
          .filter((w) => w.mastery < 0.8)
          .map((w) => ({ name: w.topic.name, subject: w.topic.subject.nameUz, mastery: Math.round(w.mastery * 100) / 100 })),
        errorsDue,
        recentResults: attempts.map((a) => ({
          title: a.test.title,
          percent: a.maxScore && Number(a.maxScore) > 0 ? Math.round((Number(a.score) / Number(a.maxScore)) * 100) : 0,
        })),
        goal: dto.goal,
      },
      LONG_TIMEOUT_MS,
    );
    await this.logUsage(userId, 'plan', reply.model, reply.usage);

    const now = new Date();
    await this.prisma.studentProfile.upsert({
      where: { userId },
      create: { userId, studyPlan: reply.plan, studyPlanAt: now, dailyMinutes: minutesPerDay },
      update: { studyPlan: reply.plan, studyPlanAt: now, dailyMinutes: minutesPerDay },
    });
    return { plan: reply.plan, createdAt: now, minutesPerDay, model: reply.model };
  }

  private logUsage(userId: string, feature: string, model: string, usage: EngineUsage) {
    return this.prisma.aiUsage.create({
      data: { userId, feature, model, tokensIn: usage.inputTokens, tokensOut: usage.outputTokens },
    });
  }
}

// ───────────── Controller ─────────────

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiContentController {
  constructor(private readonly s: AiContentService) {}

  /** Ruxsat (questions:create) service ichida tekshiriladi */
  @Post('questions/generate') generate(@CurrentUser() u: AuthUser, @Body() dto: GenerateQuestionsDto) { return this.s.generateQuestions(u.id, dto); }
  @Post('questions/save') save(@CurrentUser() u: AuthUser, @Body() dto: SaveGeneratedDto) { return this.s.saveGenerated(u.id, dto); }

  @Get('study-plan') getPlan(@CurrentUser() u: AuthUser) { return this.s.getStudyPlan(u.id); }
  @Post('study-plan') createPlan(@CurrentUser() u: AuthUser, @Body() dto: StudyPlanDto) { return this.s.createStudyPlan(u.id, dto); }
}
