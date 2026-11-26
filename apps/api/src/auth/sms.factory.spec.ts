import { ConfigService } from '@nestjs/config';
import configuration from '../config/configuration';
import { EskizSmsProvider } from './eskiz-sms.provider';
import { createSmsProvider } from './sms.factory';
import { ConsoleSmsProvider } from './sms.provider';

describe('SMS provayder sozlamasi', () => {
  const original = process.env;
  const credentials = { SMS_PROVIDER: 'eskiz', ESKIZ_EMAIL: 'sms@example.com', ESKIZ_PASSWORD: 'test-api-password' };

  /** Mashinadagi SMS/ESKIZ o'zgaruvchilaridan mustaqil muhit */
  function load(env: Record<string, string>) {
    const clean = Object.fromEntries(Object.entries(original).filter(([k]) => !/^(SMS_|ESKIZ_|NODE_ENV$)/.test(k)));
    process.env = {
      ...clean,
      JWT_ACCESS_SECRET: 'test',
      JWT_VERIFICATION_SECRET: 'test',
      OTP_SECRET: 'test',
      AI_INTERNAL_KEY: 'test',
      ...env,
    };
    return configuration();
  }
  const providerFor = (env: Record<string, string>) => createSmsProvider(new ConfigService(load(env)));

  afterEach(() => (process.env = original));

  it('development\'da standart — console', () => {
    expect(providerFor({ NODE_ENV: 'development' })).toBeInstanceOf(ConsoleSmsProvider);
    expect(providerFor({ SMS_PROVIDER: '' })).toBeInstanceOf(ConsoleSmsProvider);
    expect(providerFor({ NODE_ENV: 'test', SMS_PROVIDER: 'console' })).toBeInstanceOf(ConsoleSmsProvider);
  });

  it('eskiz tanlansa Eskiz adapteri, standart qiymatlar bilan', () => {
    expect(providerFor({ NODE_ENV: 'production', ...credentials })).toBeInstanceOf(EskizSmsProvider);
    expect(load({ ...credentials, ESKIZ_FROM: '' }).sms.eskiz).toMatchObject({ from: '4546', timeoutMs: 10000 });
    expect(load({ ...credentials, ESKIZ_FROM: 'ANC', ESKIZ_TIMEOUT_MS: '5000' }).sms.eskiz).toMatchObject({ from: 'ANC', timeoutMs: 5000 });
  });

  it.each<[string, Record<string, string>]>([
    ['SMS_PROVIDER berilmagan', {}],
    ['SMS_PROVIDER bo\'sh', { SMS_PROVIDER: '' }],
    ['console', { SMS_PROVIDER: 'console' }],
  ])('production\'da console bilan ishga tushmaydi: %s', (_name, env) => {
    expect(() => load({ NODE_ENV: 'production', ...env })).toThrow('SMS_PROVIDER=eskiz is required in production');
  });

  it.each(['production', 'development'])('bo\'sh kirish ma\'lumoti bilan ishga tushmaydi (%s)', (NODE_ENV) => {
    expect(() => load({ NODE_ENV, SMS_PROVIDER: 'eskiz' })).toThrow('requires ESKIZ_EMAIL, ESKIZ_PASSWORD');
    expect(() => load({ NODE_ENV, ...credentials, ESKIZ_EMAIL: '  ' })).toThrow('requires ESKIZ_EMAIL');
    expect(() => load({ NODE_ENV, ...credentials, ESKIZ_PASSWORD: '' })).toThrow('requires ESKIZ_PASSWORD');
  });

  it('noma\'lum provayder va noto\'g\'ri timeout rad etiladi', () => {
    expect(() => load({ SMS_PROVIDER: 'esk1z' })).toThrow('must be "console" or "eskiz"');
    for (const ESKIZ_TIMEOUT_MS of ['abc', '0', '-5', '1.5']) {
      expect(() => load({ ...credentials, ESKIZ_TIMEOUT_MS })).toThrow('ESKIZ_TIMEOUT_MS');
    }
  });
});
