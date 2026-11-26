import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { createSmsProvider } from './sms.factory';
import { SmsProvider } from './sms.provider';

@Module({
  controllers: [AuthController],
  providers: [AuthService, { provide: SmsProvider, inject: [ConfigService], useFactory: createSmsProvider }],
})
export class AuthModule {}
