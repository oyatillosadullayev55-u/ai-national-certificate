import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ErrorEntryStatus, ErrorReason, Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDefined, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { evaluateAnswer } from '../answer-evaluation/answer-evaluation';
import { AuthUser, CurrentUser } from '../common/decorators';
import { pageArgs, paged, PaginationQueryDto } from '../common/http';
import { PrismaService } from '../common/prisma/prisma.service';
import { toReviewView, toStudentView, versionWithOptions } from '../questions/question-view';
import { nextReview, RESOLVE_AFTER_REPETITIONS } from './srs';

export class ErrorQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() topicId?: string;
  @ApiPropertyOptional({ enum: ErrorEntryStatus }) @IsOptional() @IsEnum(ErrorEntryStatus) status?: ErrorEntryStatus;
  @ApiPropertyOptional({ description: 'Faqat bugun takrorlanishi kerak bo\'lganlar' })
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() due?: boolean;
}

export class RetryDto {
  @ApiProperty() @IsDefined() response: Record<string, unknown>;
}

export class UpdateErrorDto {
  @ApiPropertyOptional({ enum: ErrorEntryStatus }) @IsOptional() @IsEnum(ErrorEntryStatus) status?: ErrorEntryStatus;
  @ApiPropertyOptional({ enum: ErrorReason }) @IsOptional() @IsEnum(ErrorReason) reason?: ErrorReason;
}

@Injectable()
export class ErrorNotebookService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, q: ErrorQueryDto) {
    const where: Prisma.ErrorNotebookEntryWhereInput = {
      userId,
      status: q.status ?? (q.due ? { not: 'RESOLVED' } : undefined),
      ...(q.due ? { nextReviewAt: { lte: new Date() } } : {}),
      questionVersion: { question: { subjectId: q.subjectId, topicId: q.topicId } },
    };
    const [items, total] = await Promise.all([
      this.prisma.errorNotebookEntry.findMany({
        where, ...pageArgs(q), orderBy: [{ nextReviewAt: 'asc' }],
        include: { questionVersion: { include: versionWithOptions } },
      }),
      this.prisma.errorNotebookEntry.count({ where }),
    ]);
    return paged(
      items.map(({ questionVersion, ...e }) => ({ ...e, question: toStudentView(questionVersion) })),
      total, q,
    );
  }

  async summary(userId: string) {
    const rows = await this.prisma.$queryRaw<{ topic_id: string; topic_name: string; open: bigint; resolved: bigint }[]>`
      SELECT t.id AS topic_id, t.name AS topic_name,
             COUNT(*) FILTER (WHERE e.status <> 'RESOLVED') AS open,
             COUNT(*) FILTER (WHERE e.status = 'RESOLVED') AS resolved
      FROM error_notebook_entries e
      JOIN question_versions v ON v.id = e."questionVersionId"
      JOIN questions q ON q.id = v."questionId"
      JOIN topics t ON t.id = q."topicId"
      WHERE e."userId" = ${userId}::uuid
      GROUP BY t.id, t.name
      ORDER BY open DESC`;
    const due = await this.prisma.errorNotebookEntry.count({ where: { userId, status: { not: 'RESOLVED' }, nextReviewAt: { lte: new Date() } } });
    return { dueToday: due, byTopic: rows.map((r) => ({ topicId: r.topic_id, topicName: r.topic_name, open: Number(r.open), resolved: Number(r.resolved) })) };
  }

  /** Yechim faqat shu yerda ko'rsatiladi — xato allaqachon qilingan */
  async get(userId: string, id: string) {
    const e = await this.own(userId, id);
    const v = await this.prisma.questionVersion.findUniqueOrThrow({ where: { id: e.questionVersionId }, include: versionWithOptions });
    return { ...e, question: toReviewView(v) };
  }

  async retry(userId: string, id: string, dto: RetryDto) {
    const e = await this.own(userId, id);
    if (e.status === 'RESOLVED') throw new BadRequestException('Bu xato allaqachon tuzatilgan');
    const v = await this.prisma.questionVersion.findUniqueOrThrow({ where: { id: e.questionVersionId }, include: versionWithOptions });
    const r = evaluateAnswer({ type: v.question.type, options: v.options, answerKey: v.answerKey }, dto.response);
    if (r.isCorrect === null) throw new BadRequestException('Bu turdagi savol qo\'lda tekshiriladi');

    const srs = nextReview(e, r.isCorrect ? 4 : 1);
    const resolved = r.isCorrect && srs.repetitions >= RESOLVE_AFTER_REPETITIONS;
    const updated = await this.prisma.errorNotebookEntry.update({
      where: { id },
      data: {
        repetitions: srs.repetitions, easeFactor: srs.easeFactor, intervalDays: srs.intervalDays, nextReviewAt: srs.nextReviewAt,
        lastReviewedAt: new Date(), status: resolved ? 'RESOLVED' : 'REVIEWING',
        ...(r.isCorrect ? {} : { wrongCount: { increment: 1 } }),
      },
    });
    return {
      isCorrect: r.isCorrect,
      status: updated.status,
      nextReviewAt: updated.nextReviewAt,
      correct: toReviewView(v),
    };
  }

  async update(userId: string, id: string, dto: UpdateErrorDto) {
    await this.own(userId, id);
    return this.prisma.errorNotebookEntry.update({ where: { id }, data: dto });
  }

  private async own(userId: string, id: string) {
    const e = await this.prisma.errorNotebookEntry.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Topilmadi');
    if (e.userId !== userId) throw new ForbiddenException();
    return e;
  }
}

@ApiTags('error-notebook')
@ApiBearerAuth()
@Controller('error-notebook')
export class ErrorNotebookController {
  constructor(private readonly s: ErrorNotebookService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query() q: ErrorQueryDto) { return this.s.list(u.id, q); }
  @Get('summary') summary(@CurrentUser() u: AuthUser) { return this.s.summary(u.id); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.get(u.id, id); }
  @Post(':id/retry') retry(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RetryDto) { return this.s.retry(u.id, id, dto); }
  @Patch(':id/status') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateErrorDto) { return this.s.update(u.id, id, dto); }
}

@Module({ controllers: [ErrorNotebookController], providers: [ErrorNotebookService] })
export class ErrorNotebookModule {}
