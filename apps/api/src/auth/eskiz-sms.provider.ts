import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { maskPhone, SmsProvider } from './sms.provider';

export interface EskizOptions {
  email: string;
  password: string;
  /** Jo'natuvchi: 4546 yoki Eskiz tasdiqlagan nik */
  from: string;
  /** Har bir HTTP so'rov uchun */
  timeoutMs: number;
}

const BASE_URL = 'https://notify.eskiz.uz/api';
/** Eskiz tokeni 30 kun yashaydi — muddati tugashidan oldinroq yangilaymiz */
const TOKEN_REFRESH_AFTER_MS = 28 * 86_400_000;

interface EskizBody {
  id?: unknown;
  message?: unknown;
  data?: { token?: unknown };
}

interface EskizResponse {
  status: number;
  ok: boolean;
  body: EskizBody;
}

/** Xabari logga yozish uchun xavfsiz: kod, telefon, parol va token qatnashmaydi */
class EskizError extends Error {}

/**
 * Eskiz.uz SMS shlyuzi.
 * Rasmiy hujjat: https://documenter.getpostman.com/view/663428/RzfmES4z
 */
export class EskizSmsProvider extends SmsProvider {
  private readonly logger = new Logger('SMS');
  private token?: { value: string; refreshAt: number };
  private pendingToken?: Promise<string>;

  constructor(private readonly options: EskizOptions) {
    super();
  }

  async send(phone: string, text: string): Promise<void> {
    try {
      const id = await this.deliver(phone, text);
      this.logger.log(`Eskiz qabul qildi: ${maskPhone(phone)}, id=${id}`);
    } catch (e) {
      const reason = e instanceof EskizError ? e.message : `kutilmagan xato (${(e as Error)?.name})`;
      this.logger.error(`SMS yuborilmadi: ${maskPhone(phone)} — ${reason}`);
      throw new ServiceUnavailableException('SMS yuborib bo\'lmadi. Birozdan keyin qayta urinib ko\'ring');
    }
  }

  private async deliver(phone: string, text: string): Promise<string> {
    const fields = { mobile_phone: phone.replace(/\D/g, ''), message: text, from: this.options.from };
    const post = (token: string) => this.request('POST', '/message/sms/send', { token, fields });

    let token = await this.getToken();
    let res = await post(token);
    if (res.status === 401) {
      // Token muddatidan oldin bekor qilingan: qayta login qilib, bir marta takrorlaymiz
      this.forgetToken(token);
      token = await this.getToken();
      res = await post(token);
      if (res.status === 401) this.forgetToken(token);
    }
    if (!res.ok || typeof res.body.id !== 'string') throw this.failure('/message/sms/send', res);
    return res.body.id;
  }

  /** Parallel so'rovlar bitta login/refresh natijasini kutadi */
  private getToken(): Promise<string> {
    const cached = this.token;
    if (cached && Date.now() < cached.refreshAt) return Promise.resolve(cached.value);
    this.pendingToken ??= this.renewToken(cached?.value).finally(() => (this.pendingToken = undefined));
    return this.pendingToken;
  }

  private forgetToken(stale: string) {
    // Boshqa so'rov allaqachon yangi token olgan bo'lsa, unga tegmaymiz
    if (this.token?.value === stale) this.token = undefined;
  }

  private async renewToken(current?: string): Promise<string> {
    if (current) {
      try {
        return this.remember('/auth/refresh', await this.request('PATCH', '/auth/refresh', { token: current }));
      } catch (e) {
        this.logger.warn(`Tokenni yangilab bo'lmadi, qayta login: ${(e as Error).message}`);
        this.forgetToken(current);
      }
    }
    const fields = { email: this.options.email, password: this.options.password };
    return this.remember('/auth/login', await this.request('POST', '/auth/login', { fields }));
  }

  private remember(path: string, res: EskizResponse): string {
    const value = res.body.data?.token;
    if (!res.ok || typeof value !== 'string' || !value) throw this.failure(path, res);
    this.token = { value, refreshAt: Date.now() + TOKEN_REFRESH_AFTER_MS };
    return value;
  }

  private async request(
    method: 'POST' | 'PATCH',
    path: string,
    { token, fields }: { token?: string; fields?: Record<string, string> },
  ): Promise<EskizResponse> {
    let form: FormData | undefined;
    if (fields) {
      form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.append(key, value);
    }
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
        body: form,
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
      return { status: res.status, ok: res.ok, body: parseBody(await res.text()) };
    } catch (e) {
      const err = e as Error & { cause?: { code?: string } };
      if (err.name === 'TimeoutError') throw new EskizError(`${path}: ${this.options.timeoutMs} ms ichida javob kelmadi`);
      throw new EskizError(`${path}: tarmoq xatosi (${err.cause?.code ?? err.name})`);
    }
  }

  private failure(path: string, { status, body }: EskizResponse): EskizError {
    let detail = '';
    if (body.message) {
      const raw = typeof body.message === 'string' ? body.message : JSON.stringify(body.message);
      // Eskiz javobi SMS matni yoki raqamni qaytarishi mumkin — barcha raqamlar yashiriladi
      detail = `: ${raw.split(this.options.password).join('***').replace(/\d/g, '*').slice(0, 200)}`;
    }
    return new EskizError(`${path}: HTTP ${status}${detail}`);
  }
}

/** JSON bo'lmagan javob (masalan, proxy'ning HTML sahifasi) bo'sh obyekt hisoblanadi */
function parseBody(raw: string): EskizBody {
  try {
    const body: unknown = JSON.parse(raw);
    return body && typeof body === 'object' ? (body as EskizBody) : {};
  } catch {
    return {};
  }
}
