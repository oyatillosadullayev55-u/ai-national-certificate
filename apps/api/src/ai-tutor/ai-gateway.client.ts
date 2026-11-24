import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';

export interface EngineUsage {
  inputTokens: number;
  outputTokens: number;
}

interface EngineReply {
  content: string;
  model: string;
  flagged: boolean;
  usage: EngineUsage;
}

/** AI Engine (Python) bilan aloqa — barcha AI chaqiruvlari shu gateway orqali */
@Injectable()
export class AiGatewayClient {
  private readonly logger = new Logger(AiGatewayClient.name);
  constructor(private readonly config: ConfigService) {}

  async call<T = EngineReply>(path: string, body: unknown, timeoutMs?: number): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs ?? this.config.get<number>('ai.timeoutMs'));
    try {
      const res = await fetch(`${this.config.get('ai.engineUrl')}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-key': this.config.get<string>('ai.internalKey')! },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`AI engine ${res.status}: ${await res.text()}`);
      return (await res.json()) as T;
    } catch (e) {
      this.logger.error((e as Error).message);
      throw new ServiceUnavailableException('AI xizmati vaqtincha ishlamayapti');
    } finally {
      clearTimeout(timer);
    }
  }
}

/** O'quvchining kunlik AI limiti (tutor, izoh, reja — hammasi birga hisoblanadi) */
export async function assertDailyAiLimit(prisma: PrismaService, config: ConfigService, userId: string) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const used = await prisma.aiUsage.count({ where: { userId, createdAt: { gte: since }, feature: { in: ['tutor', 'explanation', 'plan'] } } });
  // TODO: tarifga qarab (subscription_plans.limits.aiMessagesPerDay)
  const limit = config.get<number>('ai.dailyMessageLimitFree')!;
  if (used >= limit) throw new HttpException(`Kunlik AI limiti (${limit}) tugadi`, HttpStatus.TOO_MANY_REQUESTS);
}
