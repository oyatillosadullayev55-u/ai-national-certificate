import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, NotFoundException,
  Param, ParseUUIDPipe, Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Prisma, SpeakingSession } from '@prisma/client';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/decorators';
import { PrismaService } from '../common/prisma/prisma.service';
import { ExamEngineService } from '../exam/exam-engine.service';
import { AiGatewayClient, assertDailyAiLimit, EngineUsage } from './ai-gateway.client';

export const SPEAKING_LANGUAGES = ['en', 'ru', 'uz'] as const;
export type SpeakingLanguage = (typeof SPEAKING_LANGUAGES)[number];

/** Suhbatni boshlovchi savol — model chaqirilmaydi */
const OPENING: Record<SpeakingLanguage, string> = {
  en: "Hello! Let's have a short conversation in English. First, could you tell me about yourself?",
  ru: 'Здравствуйте! Давайте немного поговорим по-русски. Сначала расскажите, пожалуйста, о себе.',
  uz: "Assalomu alaykum! Keling, o'zbek tilida suhbatlashamiz. Avval o'zingiz haqingizda gapirib bering.",
};

/** Darajani aniqlash uchun kerakli va bitta suhbatda ruxsat etilgan javoblar soni */
export const MIN_ANSWERS = 3;
export const MAX_ANSWERS = 20;
const ASSESS_TIMEOUT_MS = 120_000;

export interface SpeakingMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Javob ovoz bilan aytilganmi (yoki klaviaturada yozilganmi) */
  spoken?: boolean;
}

export class CreateSpeakingDto {
  @ApiProperty({ enum: SPEAKING_LANGUAGES }) @IsIn(SPEAKING_LANGUAGES) language: SpeakingLanguage;
}

export class SpeakingAnswerDto {
  @ApiProperty() @IsString() @Length(1, 2000) content: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() spoken?: boolean;
}

@Injectable()
export class SpeakingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayClient,
    private readonly engine: ExamEngineService,
    private readonly config: ConfigService,
  ) {}

  async create(userId: string, dto: CreateSpeakingDto) {
    await this.assertNoExam(userId);
    const messages: SpeakingMessage[] = [{ role: 'assistant', content: OPENING[dto.language] }];
    const s = await this.prisma.speakingSession.create({
      data: { userId, language: dto.language, messages: messages as unknown as Prisma.InputJsonValue },
    });
    return this.view(s);
  }

  list(userId: string) {
    return this.prisma.speakingSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, language: true, level: true, createdAt: true },
    });
  }

  async get(userId: string, id: string) {
    return this.view(await this.own(userId, id));
  }

  async answer(userId: string, id: string, dto: SpeakingAnswerDto) {
    const s = await this.own(userId, id);
    if (s.result) throw new ConflictException('Suhbat yakunlangan — yangisini boshlang');
    await this.assertNoExam(userId);
    const messages = messagesOf(s);
    if (countAnswers(messages) >= MAX_ANSWERS) throw new ConflictException('Javoblar yetarli — darajangizni aniqlang');
    await assertDailyAiLimit(this.prisma, this.config, userId);

    messages.push({ role: 'user', content: dto.content, spoken: dto.spoken ?? false });
    const reply = await this.gateway.call('/v1/speaking/turn', { language: s.language, messages: forEngine(messages) });
    await this.recordUsage(userId, reply.model, reply.usage);
    messages.push({ role: 'assistant', content: reply.content });
    return this.view(await this.save(s, { messages: messages as unknown as Prisma.InputJsonValue }));
  }

  /** CEFR darajasini aniqlaydi. Idempotent: baholangan suhbat qayta baholanmaydi. */
  async assess(userId: string, id: string) {
    const s = await this.own(userId, id);
    if (s.result) return this.view(s);
    await this.assertNoExam(userId);
    const messages = messagesOf(s);
    const answers = countAnswers(messages);
    if (answers < MIN_ANSWERS) throw new BadRequestException(`Darajani aniqlash uchun yana ${MIN_ANSWERS - answers} ta javob kerak`);
    await assertDailyAiLimit(this.prisma, this.config, userId);

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { locale: true } });
    const reply = await this.gateway.call<{ assessment: Prisma.InputJsonObject & { level: string }; model: string; usage: EngineUsage }>(
      '/v1/speaking/assess',
      { language: s.language, locale: user.locale, messages: forEngine(messages) },
      ASSESS_TIMEOUT_MS,
    );
    await this.recordUsage(userId, reply.model, reply.usage);
    return this.view(await this.save(s, { result: reply.assessment, level: reply.assessment.level }));
  }

  /** Suhbat shu orada o'zgargan bo'lsa (parallel so'rov), ustiga yozilmaydi */
  private async save(s: SpeakingSession, data: Prisma.SpeakingSessionUpdateManyMutationInput) {
    const { count } = await this.prisma.speakingSession.updateMany({ where: { id: s.id, updatedAt: s.updatedAt }, data });
    if (!count) throw new ConflictException('Suhbat yangilangan. Qayta urinib ko\'ring');
    return this.prisma.speakingSession.findUniqueOrThrow({ where: { id: s.id } });
  }

  private view(s: SpeakingSession) {
    const messages = messagesOf(s);
    const answers = countAnswers(messages);
    return {
      id: s.id,
      language: s.language,
      messages,
      answers,
      spokenAnswers: messages.filter((m) => m.role === 'user' && m.spoken).length,
      answersNeeded: Math.max(0, MIN_ANSWERS - answers),
      canAnswer: !s.result && answers < MAX_ANSWERS,
      level: s.level,
      result: s.result,
      createdAt: s.createdAt,
    };
  }

  private async own(userId: string, id: string) {
    const s = await this.prisma.speakingSession.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Suhbat topilmadi');
    if (s.userId !== userId) throw new ForbiddenException();
    return s;
  }

  private async assertNoExam(userId: string) {
    if (await this.engine.hasActiveControlledExam(userId)) {
      throw new ForbiddenException('Imtihon davomida AI suhbat o\'chirilgan. Testni yakunlagach davom eting.');
    }
  }

  private recordUsage(userId: string, model: string, usage: EngineUsage) {
    return this.prisma.aiUsage.create({
      data: { userId, feature: 'speaking', model, tokensIn: usage.inputTokens, tokensOut: usage.outputTokens },
    });
  }
}

const messagesOf = (s: SpeakingSession) => [...(s.messages as unknown as SpeakingMessage[])];
const countAnswers = (messages: SpeakingMessage[]) => messages.filter((m) => m.role === 'user').length;
const forEngine = (messages: SpeakingMessage[]) => messages.map(({ role, content }) => ({ role, content }));

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/speaking/sessions')
export class SpeakingController {
  constructor(private readonly s: SpeakingService) {}

  @ApiOperation({ summary: 'Yangi ovozli suhbat (en / ru / uz)' })
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateSpeakingDto) { return this.s.create(u.id, dto); }

  @Get() list(@CurrentUser() u: AuthUser) { return this.s.list(u.id); }

  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.get(u.id, id); }

  @Post(':id/messages')
  answer(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SpeakingAnswerDto) {
    return this.s.answer(u.id, id, dto);
  }

  @ApiOperation({ summary: 'CEFR bo\'yicha til darajasini aniqlash — idempotent' })
  @Post(':id/assess') @HttpCode(200)
  assess(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.assess(u.id, id); }
}
