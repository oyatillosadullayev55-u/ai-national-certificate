import { Injectable, Logger } from '@nestjs/common';

export abstract class SmsProvider {
  abstract send(phone: string, text: string): Promise<void>;
}

/**
 * Development uchun: SMS yubormaydi, kodni logga chiqaradi.
 * Production'da Eskiz.uz / Playmobile kabi provayder adapterini shu interfeys bo'yicha yozing.
 */
@Injectable()
export class ConsoleSmsProvider extends SmsProvider {
  private readonly logger = new Logger('SMS');
  async send(phone: string, text: string) {
    this.logger.log(`→ ${phone.slice(0, 6)}***${phone.slice(-2)}: ${text}`);
  }
}
