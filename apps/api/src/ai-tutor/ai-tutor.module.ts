import {
  Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/decorators';
import { PrismaService } from '../common/prisma/prisma.service';
import { ExamEngineService } from '../exam/exam-engine.service';
import { ExamModule } from '../exam/exam.module';
import { toReviewView, versionWithOptions } from '../questions/question-view';
import { QuestionsModule } from '../questions/questions.module';
import { AiContentController, AiContentService } from './ai-content';
import { AiGatewayClient, assertDailyAiLimit } from './ai-gateway.client';

export class CreateConversationDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 120) title?: string;
}

export class SendMessageDto {
  @ApiProperty() @IsString() @Length(1, 4000) content: string;
}

export class ExplainDto {
  @ApiProperty() @IsUUID() attemptId: string;
  @ApiProperty() @IsUUID() questionVersionId: string;
}

@Injectable()
export class AiTutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayClient,
    private readonly engine: ExamEngineService,
    private readonly config: ConfigService,
  ) {}

  createConversation(userId: string, dto: CreateConversationDto) {
    return this.prisma.aiConversation.create({ data: { userId, subjectId: dto.subjectId, title: dto.title } });
  }

  list(userId: string) {
    return this.prisma.aiConversation.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 50 });
  }

  async get(userId: string, id: string) {
    const c = await this.prisma.aiConversation.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    if (!c) throw new NotFoundException();
    if (c.userId !== userId) throw new ForbiddenException();
    return c;
  }

  async sendMessage(userId: string, conversationId: string, dto: SendMessageDto) {
    const conv = await this.get(userId, conversationId);

    // PRD 3.8: nazoratli imtihon davomida AI javob bermaydi
    if (await this.engine.hasActiveControlledExam(userId)) {
      throw new ForbiddenException('Imtihon davomida AI Tutor vaqtincha o\'chirilgan. Testni yakunlagach davom eting.');
    }
    await this.assertDailyLimit(userId);

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { locale: true } });
    const weak = await this.prisma.studentProgress.findMany({
      where: { userId, mastery: { lt: 0.5 }, answered: { gte: 3 }, ...(conv.subjectId ? { topic: { subjectId: conv.subjectId } } : {}) },
      include: { topic: { select: { name: true } } },
      orderBy: { mastery: 'asc' },
      take: 5,
    });
    const subject = conv.subjectId ? await this.prisma.subject.findUnique({ where: { id: conv.subjectId } }) : null;

    const userMsg = await this.prisma.aiMessage.create({ data: { conversationId, role: 'user', content: dto.content } });
    const history = conv.messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));

    const reply = await this.gateway.call('/v1/tutor/chat', {
      messages: [...history, { role: 'user', content: dto.content }],
      student: { locale: user.locale, subject: subject?.nameUz ?? null, weakTopics: weak.map((w) => w.topic.name) },
    });

    if (reply.flagged) await this.prisma.aiMessage.update({ where: { id: userMsg.id }, data: { flagged: true } });
    const assistant = await this.prisma.aiMessage.create({
      data: { conversationId, role: 'assistant', content: reply.content, model: reply.model },
    });
    await this.prisma.$transaction([
      this.prisma.aiUsage.create({
        data: { userId, feature: 'tutor', model: reply.model, tokensIn: reply.usage.inputTokens, tokensOut: reply.usage.outputTokens },
      }),
      this.prisma.aiConversation.update({
        where: { id: conversationId },
        data: { title: conv.title ?? dto.content.slice(0, 60) },
      }),
    ]);
    return assistant;
  }

  /** Xato javob uchun AI izoh — faqat urinish yakunlangandan keyin */
  async explain(userId: string, dto: ExplainDto) {
    const attempt = await this.prisma.examAttempt.findUnique({ where: { id: dto.attemptId } });
    if (!attempt || attempt.userId !== userId) throw new NotFoundException('Urinish topilmadi');
    if (attempt.status === 'IN_PROGRESS') throw new ForbiddenException('Izoh test yakunlangandan keyin beriladi');
    if (!(attempt.questionOrder as string[]).includes(dto.questionVersionId)) throw new NotFoundException('Savol bu urinishda yo\'q');
    await this.assertDailyLimit(userId);

    const [v, answer, user] = await Promise.all([
      this.prisma.questionVersion.findUniqueOrThrow({ where: { id: dto.questionVersionId }, include: versionWithOptions }),
      this.prisma.answer.findUnique({ where: { attemptId_questionVersionId: { attemptId: dto.attemptId, questionVersionId: dto.questionVersionId } } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { locale: true } }),
    ]);
    const q = toReviewView(v);
    const reply = await this.gateway.call('/v1/explain', {
      locale: user.locale,
      question: { type: q.type, stem: q.stem, options: q.options, answerKey: q.answerKey, solution: q.solution, explanation: q.explanation },
      studentResponse: answer?.response ?? null,
    });
    await this.prisma.aiUsage.create({
      data: { userId, feature: 'explanation', model: reply.model, tokensIn: reply.usage.inputTokens, tokensOut: reply.usage.outputTokens },
    });
    // Manba: ekspert tasdiqlagan yechim — AI izohi unga tayanadi
    return { explanation: reply.content, source: { questionVersionId: v.id, expertSolution: q.solution } };
  }

  private assertDailyLimit(userId: string) {
    return assertDailyAiLimit(this.prisma, this.config, userId);
  }

}

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiTutorController {
  constructor(private readonly s: AiTutorService) {}

  @Post('tutor/conversations') create(@CurrentUser() u: AuthUser, @Body() dto: CreateConversationDto) { return this.s.createConversation(u.id, dto); }
  @Get('tutor/conversations') list(@CurrentUser() u: AuthUser) { return this.s.list(u.id); }
  @Get('tutor/conversations/:id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.get(u.id, id); }

  @Post('tutor/conversations/:id/messages')
  send(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) { return this.s.sendMessage(u.id, id, dto); }

  @Post('explanations') explain(@CurrentUser() u: AuthUser, @Body() dto: ExplainDto) { return this.s.explain(u.id, dto); }
}

@Module({
  imports: [ExamModule, QuestionsModule],
  controllers: [AiTutorController, AiContentController],
  providers: [AiTutorService, AiGatewayClient, AiContentService],
})
export class AiTutorModule {}
