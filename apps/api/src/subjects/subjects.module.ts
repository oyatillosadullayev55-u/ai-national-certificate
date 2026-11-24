import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Public, RequirePermissions } from '../common/decorators';
import { P } from '../common/permissions';
import { PrismaService } from '../common/prisma/prisma.service';

export class CreateSubjectDto {
  @ApiProperty({ example: 'math' }) @Matches(/^[a-z0-9_]{2,40}$/) code: string;
  @ApiProperty() @IsString() @Length(1, 120) nameUz: string;
  @ApiProperty() @IsString() @Length(1, 120) nameRu: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}
export class UpdateSubjectDto extends PartialType(CreateSubjectDto) {}

export class CreateExamSpecDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({
    description: 'Fan bo\'yicha imtihon formati. Universal savollar soni yo\'q — har fan alohida.',
    example: { durationSec: 10800, sections: [{ title: '1-qism', topicIds: [], count: 10, points: 1, types: ['SINGLE_CHOICE'] }] },
  })
  @IsObject() config: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activate?: boolean;
}

/** Fan mavzulari daraxtini quradi: Topic → Subtopic */
function buildTree<T extends { id: string; parentId: string | null }>(rows: T[]) {
  const map = new Map<string, T & { children: any[] }>();
  rows.forEach((r) => map.set(r.id, { ...r, children: [] }));
  const roots: (T & { children: any[] })[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) map.get(node.parentId)!.children.push(node);
    else roots.push(node);
  });
  return roots;
}

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.subject.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  }

  async get(id: string) {
    const s = await this.prisma.subject.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Fan topilmadi');
    return s;
  }

  create(dto: CreateSubjectDto) {
    return this.prisma.subject.create({ data: dto });
  }

  update(id: string, dto: UpdateSubjectDto) {
    return this.prisma.subject.update({ where: { id }, data: dto });
  }

  async topics(subjectId: string) {
    const rows = await this.prisma.topic.findMany({
      where: { subjectId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, parentId: true, level: true, name: true, difficulty: true, avgStudyMinutes: true, sortOrder: true },
    });
    return buildTree(rows);
  }

  async statistics(subjectId: string) {
    const [topics, approvedQuestions, attempts] = await Promise.all([
      this.prisma.topic.count({ where: { subjectId, deletedAt: null } }),
      this.prisma.question.count({ where: { subjectId, status: 'APPROVED', deletedAt: null } }),
      this.prisma.examAttempt.count({ where: { test: { subjectId }, status: 'SUBMITTED' } }),
    ]);
    return { topics, approvedQuestions, submittedAttempts: attempts };
  }

  async createExamSpec(subjectId: string, userId: string, dto: CreateExamSpecDto) {
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.examSpec.findFirst({ where: { subjectId }, orderBy: { version: 'desc' } });
      if (dto.activate) await tx.examSpec.updateMany({ where: { subjectId }, data: { isActive: false } });
      return tx.examSpec.create({
        data: {
          subjectId, title: dto.title, config: dto.config as object, createdById: userId,
          version: (last?.version ?? 0) + 1, isActive: !!dto.activate,
        },
      });
    });
  }

  activeExamSpec(subjectId: string) {
    return this.prisma.examSpec.findFirst({ where: { subjectId, isActive: true } });
  }
}

@ApiTags('subjects')
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly s: SubjectsService) {}

  @Public() @Get() list() { return this.s.list(); }
  @Public() @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.s.get(id); }
  @Public() @Get(':id/topics') topics(@Param('id', ParseUUIDPipe) id: string) { return this.s.topics(id); }
  @Public() @Get(':id/statistics') stats(@Param('id', ParseUUIDPipe) id: string) { return this.s.statistics(id); }
  @Public() @Get(':id/exam-spec') spec(@Param('id', ParseUUIDPipe) id: string) { return this.s.activeExamSpec(id); }

  @ApiBearerAuth() @RequirePermissions(P.subjectsManage)
  @Post() create(@Body() dto: CreateSubjectDto) { return this.s.create(dto); }

  @ApiBearerAuth() @RequirePermissions(P.subjectsManage)
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSubjectDto) { return this.s.update(id, dto); }

  @ApiBearerAuth() @RequirePermissions(P.examSpecsManage)
  @Post(':id/exam-specs')
  createSpec(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Body() dto: CreateExamSpecDto) {
    return this.s.createExamSpec(id, u.id, dto);
  }
}

@Module({ controllers: [SubjectsController], providers: [SubjectsService] })
export class SubjectsModule {}
