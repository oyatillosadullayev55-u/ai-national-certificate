import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  organizationId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string;
  requestId?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Audit yozuvi asosiy operatsiyani to'xtatib qo'ymasligi kerak */
  async log(entry: AuditEntry, tx?: Prisma.TransactionClient) {
    try {
      await (tx ?? this.prisma).auditLog.create({ data: entry });
    } catch (e) {
      this.logger.error(`Audit log yozilmadi: ${entry.action}`, (e as Error).stack);
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
