import { Injectable, Logger } from '@nestjs/common';

export abstract class SmsProvider {
  abstract send(phone: string, text: string): Promise<void>;
}

/** Logga to'liq telefon raqami yozilmasligi uchun */
export function maskPhone(phone: string) {
  return `${phone.slice(0, 6)}***${phone.slice(-2)}`;
}

/**
 * Development uchun: SMS yubormaydi, kodni logga chiqaradi.
 * Production'da ishlatib bo'lmaydi — `SMS_PROVIDER=eskiz` (eskiz-sms.provider.ts).
 */
@Injectable()
export class ConsoleSmsProvider extends SmsProvider {
  private readonly logger = new Logger('SMS');
  async send(phone: string, text: string) {
    this.logger.log(`→ ${maskPhone(phone)}: ${text}`);
  }
}
