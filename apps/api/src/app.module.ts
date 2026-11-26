import { Controller, Get, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AiTutorModule } from './ai-tutor/ai-tutor.module';
import { AuthModule } from './auth/auth.module';
import { AccessModule } from './common/access/access.service';
import { AuditModule } from './common/audit/audit.service';
import { Public } from './common/decorators';
import { JwtAuthGuard, PermissionsGuard, UserThrottlerGuard } from './common/guards';
import { AllExceptionsFilter, requestIdMiddleware } from './common/http';
import { metricsMiddleware, MetricsModule } from './common/metrics';
import { PrismaModule, PrismaService } from './common/prisma/prisma.service';
import configuration from './config/configuration';
import { ErrorNotebookModule } from './error-notebook/error-notebook.module';
import { ExamModule } from './exam/exam.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ProgressModule } from './progress/progress.module';
import { QuestionsModule } from './questions/questions.module';
import { SubjectsModule } from './subjects/subjects.module';
import { TopicsModule } from './topics/topics.module';
import { UsersModule } from './users/users.module';

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AccessModule,
    AuditModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    SubjectsModule,
    TopicsModule,
    QuestionsModule,
    ExamModule,
    ErrorNotebookModule,
    ProgressModule,
    AiTutorModule,
    AdminModule,
    MetricsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard }, // tartib muhim: limit user bo'yicha hisoblanadi
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(requestIdMiddleware, metricsMiddleware).forRoutes('*');
  }
}
