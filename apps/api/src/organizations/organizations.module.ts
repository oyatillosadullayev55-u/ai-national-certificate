import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { AccessService } from '../common/access/access.service';
import { AuditService } from '../common/audit/audit.service';
import { AuthUser, CurrentUser, RequirePermissions } from '../common/decorators';
import { P } from '../common/permissions';
import { PrismaService } from '../common/prisma/prisma.service';

export class CreateOrganizationDto {
  @ApiProperty() @IsString() @Length(2, 160) name: string;
}

export class CreateBranchDto {
  @ApiProperty() @IsString() @Length(2, 160) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\+998\d{9}$/) phone?: string;
}

const ORG_ROLES = ['center_manager', 'teacher', 'student'] as const;
export class AddMemberDto {
  @ApiProperty({ example: '+998901234567', description: 'Platformada ro\'yxatdan o\'tgan foydalanuvchi telefoni' })
  @Matches(/^\+998\d{9}$/) phone: string;
  @ApiProperty({ enum: ORG_ROLES }) @IsIn(ORG_ROLES) role: (typeof ORG_ROLES)[number];
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
}

export class CreateGroupDto {
  @ApiProperty() @IsString() @Length(1, 120) name: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) teacherIds?: string[];
}

export class GroupStudentsDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsUUID('4', { each: true }) studentIds: string[];
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessService, private readonly audit: AuditService) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    const owner = await this.prisma.role.findUniqueOrThrow({ where: { key: 'center_owner' } });
    const org = await this.prisma.$transaction(async (tx) => {
      const o = await tx.organization.create({ data: { name: dto.name, type: 'CENTER', ownerId: userId, members: { create: { userId } } } });
      await tx.userRole.create({ data: { userId, roleId: owner.id, organizationId: o.id } });
      return o;
    });
    await this.audit.log({ actorId: userId, organizationId: org.id, action: 'org.create', entityType: 'organization', entityId: org.id });
    return org;
  }

  mine(userId: string) {
    return this.prisma.organization.findMany({
      where: { deletedAt: null, members: { some: { userId } } },
      include: { roles: { where: { userId }, select: { role: { select: { key: true } }, branchId: true } } },
    });
  }

  async get(userId: string, id: string) {
    await this.access.assertOrgMember(userId, id);
    const org = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
      include: { branches: { where: { deletedAt: null } }, _count: { select: { members: true, groups: true } } },
    });
    if (!org) throw new NotFoundException('Tashkilot topilmadi');
    return org;
  }

  addBranch(orgId: string, dto: CreateBranchDto) {
    return this.prisma.branch.create({ data: { organizationId: orgId, ...dto } });
  }

  async addMember(actorId: string, orgId: string, dto: AddMemberDto) {
    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user) throw new NotFoundException('Bu raqam bilan foydalanuvchi topilmadi. Avval ro\'yxatdan o\'tishi kerak');
    if (dto.branchId) {
      const b = await this.prisma.branch.findFirst({ where: { id: dto.branchId, organizationId: orgId } });
      if (!b) throw new BadRequestException('Filial bu tashkilotga tegishli emas');
    }
    const role = await this.prisma.role.findUniqueOrThrow({ where: { key: dto.role } });
    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
        create: { organizationId: orgId, userId: user.id },
        update: {},
      });
      const exists = await tx.userRole.findFirst({ where: { userId: user.id, roleId: role.id, organizationId: orgId, branchId: dto.branchId ?? null } });
      if (!exists) await tx.userRole.create({ data: { userId: user.id, roleId: role.id, organizationId: orgId, branchId: dto.branchId } });
    });
    await this.audit.log({ actorId, organizationId: orgId, action: 'org.member_add', entityType: 'user', entityId: user.id, meta: { role: dto.role } });
    return { userId: user.id, role: dto.role };
  }

  async removeMember(actorId: string, orgId: string, userId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    if (org.ownerId === userId) throw new ForbiddenException('Tashkilot egasini o\'chirib bo\'lmaydi');
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId, organizationId: orgId } }),
      this.prisma.organizationMember.deleteMany({ where: { userId, organizationId: orgId } }),
    ]);
    await this.audit.log({ actorId, organizationId: orgId, action: 'org.member_remove', entityType: 'user', entityId: userId });
    return { ok: true };
  }

  async members(orgId: string) {
    const rows = await this.prisma.organizationMember.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: { id: true, phone: true, profile: { select: { firstName: true, lastName: true } }, roles: { where: { organizationId: orgId }, select: { role: { select: { key: true } }, branchId: true } } },
        },
      },
    });
    return rows.map((r) => r.user);
  }

  // ───────────── Groups ─────────────

  async createGroup(actorId: string, orgId: string, dto: CreateGroupDto) {
    const teacherIds = dto.teacherIds?.length ? dto.teacherIds : [actorId];
    const n = await this.prisma.organizationMember.count({ where: { organizationId: orgId, userId: { in: teacherIds } } });
    if (n !== teacherIds.length) throw new BadRequestException('O\'qituvchilar tashkilot a\'zosi bo\'lishi kerak');
    return this.prisma.group.create({
      data: {
        organizationId: orgId, branchId: dto.branchId, subjectId: dto.subjectId, name: dto.name,
        teachers: { create: teacherIds.map((teacherId) => ({ teacherId })) },
      },
    });
  }

  groups(orgId: string) {
    return this.prisma.group.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: { _count: { select: { members: true } }, teachers: { select: { teacherId: true } }, subject: { select: { nameUz: true } } },
    });
  }

  async addStudents(orgId: string, groupId: string, dto: GroupStudentsDto) {
    const g = await this.prisma.group.findFirst({ where: { id: groupId, organizationId: orgId, deletedAt: null } });
    if (!g) throw new NotFoundException('Guruh topilmadi');
    const n = await this.prisma.organizationMember.count({ where: { organizationId: orgId, userId: { in: dto.studentIds } } });
    if (n !== dto.studentIds.length) throw new BadRequestException('O\'quvchilar avval tashkilotga qo\'shilishi kerak');
    const r = await this.prisma.groupMember.createMany({ data: dto.studentIds.map((studentId) => ({ groupId, studentId })), skipDuplicates: true });
    return { added: r.count };
  }

  /** Guruh natijalari: o'qituvchi uchun tahlil */
  async groupAnalytics(orgId: string, groupId: string) {
    const g = await this.prisma.group.findFirst({
      where: { id: groupId, organizationId: orgId },
      include: { members: { include: { student: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } } } } },
    });
    if (!g) throw new NotFoundException('Guruh topilmadi');
    const ids = g.members.map((m) => m.studentId);
    const attempts = await this.prisma.examAttempt.groupBy({
      by: ['userId'],
      where: { userId: { in: ids }, status: { not: 'IN_PROGRESS' } },
      _count: { _all: true },
      _sum: { score: true, maxScore: true },
    });
    const weak = await this.prisma.studentProgress.findMany({
      where: { userId: { in: ids }, mastery: { lt: 0.5 }, answered: { gte: 3 } },
      include: { topic: { select: { name: true } } },
      orderBy: { mastery: 'asc' },
    });
    const byUser = new Map(attempts.map((a) => [a.userId, a]));
    return g.members.map((m) => {
      const a = byUser.get(m.studentId);
      const max = Number(a?._sum.maxScore ?? 0);
      return {
        student: m.student,
        attempts: a?._count._all ?? 0,
        avgPercent: max > 0 ? Math.round((Number(a!._sum.score) / max) * 100) : null,
        weakTopics: weak.filter((w) => w.userId === m.studentId).slice(0, 5).map((w) => ({ topicId: w.topicId, name: w.topic.name, mastery: w.mastery })),
      };
    });
  }
}

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly s: OrganizationsService) {}

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateOrganizationDto) { return this.s.create(u.id, dto); }
  @Get() mine(@CurrentUser() u: AuthUser) { return this.s.mine(u.id); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.get(u.id, id); }

  @RequirePermissions(P.orgManage, { orgFrom: 'params.id' })
  @Post(':id/branches') branch(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateBranchDto) { return this.s.addBranch(id, dto); }

  @RequirePermissions(P.orgMembersManage, { orgFrom: 'params.id' })
  @Get(':id/members') members(@Param('id', ParseUUIDPipe) id: string) { return this.s.members(id); }

  @RequirePermissions(P.orgMembersManage, { orgFrom: 'params.id' })
  @Post(':id/members') addMember(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMemberDto) {
    return this.s.addMember(u.id, id, dto);
  }

  @RequirePermissions(P.orgMembersManage, { orgFrom: 'params.id' })
  @Delete(':id/members/:userId') removeMember(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.s.removeMember(u.id, id, userId);
  }

  @RequirePermissions(P.groupsManage, { orgFrom: 'params.id' })
  @Post(':id/groups') createGroup(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateGroupDto) {
    return this.s.createGroup(u.id, id, dto);
  }

  @RequirePermissions(P.groupsManage, { orgFrom: 'params.id' })
  @Get(':id/groups') groups(@Param('id', ParseUUIDPipe) id: string) { return this.s.groups(id); }

  @RequirePermissions(P.groupsManage, { orgFrom: 'params.id' })
  @Post(':id/groups/:groupId/students')
  addStudents(@Param('id', ParseUUIDPipe) id: string, @Param('groupId', ParseUUIDPipe) groupId: string, @Body() dto: GroupStudentsDto) {
    return this.s.addStudents(id, groupId, dto);
  }

  @RequirePermissions(P.groupsManage, { orgFrom: 'params.id' })
  @Get(':id/groups/:groupId/analytics')
  analytics(@Param('id', ParseUUIDPipe) id: string, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.s.groupAnalytics(id, groupId);
  }
}

@Module({ controllers: [OrganizationsController], providers: [OrganizationsService] })
export class OrganizationsModule {}
