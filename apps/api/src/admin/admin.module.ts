import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Prisma, UserStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuditService } from '../common/audit/audit.service';
import { AuthUser, CurrentUser, RequirePermissions } from '../common/decorators';
import { pageArgs, paged, PaginationQueryDto } from '../common/http';
import { P } from '../common/permissions';
import { PrismaService } from '../common/prisma/prisma.service';

export class UserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Telefon, email yoki ism' }) @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() role?: string;
}

export class AssignRoleDto {
  @ApiProperty({ example: 'subject_expert' }) @IsString() roleKey: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() organizationId?: string;
}

export class SetStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'BLOCKED'] }) @IsEnum(['ACTIVE', 'BLOCKED']) status: UserStatus;
}

export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() actorId?: string;
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async dashboard() {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [users, newUsers, students, questionsByStatus, reviewQueue, attemptsWeek, aiToday, subjects] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.studentProfile.count(),
      this.prisma.question.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      this.prisma.questionVersion.count({ where: { status: 'IN_REVIEW' } }),
      this.prisma.examAttempt.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.aiUsage.aggregate({ where: { createdAt: { gte: today } }, _count: { _all: true }, _sum: { tokensIn: true, tokensOut: true } }),
      this.prisma.subject.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { id: true, nameUz: true, _count: { select: { topics: true, questions: { where: { status: 'APPROVED', deletedAt: null } } } } },
      }),
    ]);
    return {
      users, newUsersWeek: newUsers, students, reviewQueue, attemptsWeek,
      questions: Object.fromEntries(questionsByStatus.map((q) => [q.status, q._count._all])),
      aiToday: { requests: aiToday._count._all, tokensIn: aiToday._sum.tokensIn ?? 0, tokensOut: aiToday._sum.tokensOut ?? 0 },
      subjects: subjects.map((s) => ({ id: s.id, name: s.nameUz, topics: s._count.topics, approvedQuestions: s._count.questions })),
    };
  }

  async users(q: UserQueryDto) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(q.q
        ? {
            OR: [
              { phone: { contains: q.q } },
              { email: { contains: q.q, mode: 'insensitive' } },
              { profile: { firstName: { contains: q.q, mode: 'insensitive' } } },
              { profile: { lastName: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(q.role ? { roles: { some: { role: { key: q.role } } } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where, ...pageArgs(q), orderBy: { createdAt: 'desc' },
        select: {
          id: true, phone: true, email: true, status: true, createdAt: true,
          profile: { select: { firstName: true, lastName: true } },
          roles: { select: { id: true, organizationId: true, role: { select: { key: true, name: true } } } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paged(items, total, q);
  }

  roles() {
    return this.prisma.role.findMany({ orderBy: { key: 'asc' }, include: { permissions: { include: { permission: { select: { key: true } } } } } });
  }

  async assignRole(actorId: string, userId: string, dto: AssignRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { key: dto.roleKey } });
    if (!role) throw new NotFoundException('Rol topilmadi');
    await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const exists = await this.prisma.userRole.findFirst({ where: { userId, roleId: role.id, organizationId: dto.organizationId ?? null, branchId: null } });
    const ur = exists ?? (await this.prisma.userRole.create({ data: { userId, roleId: role.id, organizationId: dto.organizationId } }));
    await this.audit.log({ actorId, action: 'admin.role_assign', entityType: 'user', entityId: userId, meta: { role: dto.roleKey, organizationId: dto.organizationId ?? null } });
    return ur;
  }

  async removeRole(actorId: string, userId: string, userRoleId: string) {
    const r = await this.prisma.userRole.deleteMany({ where: { id: userRoleId, userId } });
    if (!r.count) throw new NotFoundException('Topilmadi');
    await this.audit.log({ actorId, action: 'admin.role_remove', entityType: 'user', entityId: userId, meta: { userRoleId } });
    return { ok: true };
  }

  async setStatus(actorId: string, userId: string, dto: SetStatusDto) {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { status: dto.status } }),
      ...(dto.status === 'BLOCKED'
        ? [this.prisma.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })]
        : []),
    ]);
    await this.audit.log({ actorId, action: `admin.user_${dto.status.toLowerCase()}`, entityType: 'user', entityId: userId });
    return { ok: true };
  }

  async aiUsage() {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const rows = await this.prisma.$queryRaw<{ day: Date; feature: string; requests: bigint; tokens_in: bigint; tokens_out: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, feature, COUNT(*) AS requests,
             COALESCE(SUM("tokensIn"),0) AS tokens_in, COALESCE(SUM("tokensOut"),0) AS tokens_out
      FROM ai_usage WHERE "createdAt" >= ${since}
      GROUP BY 1, 2 ORDER BY 1 DESC`;
    return rows.map((r) => ({ day: r.day, feature: r.feature, requests: Number(r.requests), tokensIn: Number(r.tokens_in), tokensOut: Number(r.tokens_out) }));
  }

  async auditLogs(q: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      action: q.action ? { contains: q.action } : undefined,
      entityType: q.entityType,
      actorId: q.actorId,
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, ...pageArgs(q), orderBy: { createdAt: 'desc' } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paged(items, total, q);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly s: AdminService) {}

  @RequirePermissions(P.usersRead) @Get('dashboard') dashboard() { return this.s.dashboard(); }
  @RequirePermissions(P.usersRead) @Get('users') users(@Query() q: UserQueryDto) { return this.s.users(q); }
  @RequirePermissions(P.rolesManage) @Get('roles') roles() { return this.s.roles(); }

  @RequirePermissions(P.rolesManage)
  @Post('users/:id/roles')
  assign(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignRoleDto) { return this.s.assignRole(u.id, id, dto); }

  @RequirePermissions(P.rolesManage)
  @Delete('users/:id/roles/:userRoleId')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('userRoleId', ParseUUIDPipe) rid: string) {
    return this.s.removeRole(u.id, id, rid);
  }

  @RequirePermissions(P.usersManage)
  @Patch('users/:id/status')
  status(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetStatusDto) { return this.s.setStatus(u.id, id, dto); }

  @RequirePermissions(P.aiUsageRead) @Get('ai-usage') ai() { return this.s.aiUsage(); }
  @RequirePermissions(P.auditRead) @Get('audit-logs') audit(@Query() q: AuditQueryDto) { return this.s.auditLogs(q); }
}

@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
