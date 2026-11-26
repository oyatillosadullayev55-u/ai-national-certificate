import { ConfigService } from '@nestjs/config';
import { EskizOptions, EskizSmsProvider } from './eskiz-sms.provider';
import { ConsoleSmsProvider, SmsProvider } from './sms.provider';

/** `SMS_PROVIDER` bo'yicha adapter tanlaydi; qiymatlar configuration.ts da tekshirilgan */
export function createSmsProvider(config: ConfigService): SmsProvider {
  if (config.get<string>('sms.provider') === 'eskiz') {
    return new EskizSmsProvider(config.get<EskizOptions>('sms.eskiz')!);
  }
  return new ConsoleSmsProvider();
}
