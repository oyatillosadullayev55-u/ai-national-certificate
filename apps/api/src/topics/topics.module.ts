import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { Public, RequirePermissions } from '../common/decorators';
import { P } from '../common/permissions';
import { PrismaService } from '../common/prisma/prisma.service';

export class CreateTopicDto {
  @ApiProperty() @IsUUID() subjectId: string;
  @ApiPropertyOptional({ description: 'Subtopic uchun ota mavzu' }) @IsOptional() @IsUUID() parentId?: string;
  @ApiProperty() @IsString() @Length(1, 200) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 5 }) @IsOptional() @IsInt() @Min(1) @Max(5) difficulty?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) avgStudyMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}
export class UpdateTopicDto extends PartialType(CreateTopicDto) {}

export class AddDependencyDto {
  @ApiProperty({ description: 'Bu mavzudan oldin o\'rganilishi kerak bo\'lgan mavzu' }) @IsUUID() prerequisiteId: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsNumber() @Min(0) @Max(1) weight?: number;
}

export class CreateObjectiveDto {
  @ApiProperty() @IsString() @Length(1, 300) title: string;
}

export class CreateMaterialDto {
  @ApiProperty({ enum: ['theory', 'formula', 'video', 'pdf'] }) @IsEnum(['theory', 'formula', 'video', 'pdf']) type: string;
  @ApiProperty() @IsString() @Length(1, 200) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() url?: string;
}

@Injectable()
export class TopicsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(id: string) {
    const t = await this.prisma.topic.findFirst({
      where: { id, deletedAt: null },
      include: { objectives: true, children: { where: { deletedAt: null } } },
    });
    if (!t) throw new NotFoundException('Mavzu topilmadi');
    return t;
  }

  async create(dto: CreateTopicDto) {
    if (dto.parentId) {
      const parent = await this.get(dto.parentId);
      if (parent.subjectId !== dto.subjectId) throw new BadRequestException('Ota mavzu boshqa fanga tegishli');
      if (parent.level === 'SUBTOPIC') throw new BadRequestException('Subtopic ichida yana subtopic bo\'lmaydi');
    }
    return this.prisma.topic.create({ data: { ...dto, level: dto.parentId ? 'SUBTOPIC' : 'TOPIC' } });
  }

  update(id: string, dto: UpdateTopicDto) {
    const { subjectId, parentId, ...rest } = dto; // fan va ota mavzu bu yerda o'zgartirilmaydi
    return this.prisma.topic.update({ where: { id }, data: rest });
  }

  remove(id: string) {
    return this.prisma.topic.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async dependencies(id: string) {
    const [prerequisites, dependents] = await Promise.all([
      this.prisma.topicDependency.findMany({ where: { topicId: id }, include: { prerequisite: { select: { id: true, name: true } } } }),
      this.prisma.topicDependency.findMany({ where: { prerequisiteId: id }, include: { topic: { select: { id: true, name: true } } } }),
    ]);
    return {
      prerequisites: prerequisites.map((d) => ({ ...d.prerequisite, weight: d.weight })),
      dependents: dependents.map((d) => ({ ...d.topic, weight: d.weight })),
    };
  }

  /** Knowledge Graph'ga qirra qo'shadi; aylanma bog'liqlikka yo'l qo'ymaydi */
  async addDependency(topicId: string, dto: AddDependencyDto) {
    if (topicId === dto.prerequisiteId) throw new BadRequestException('Mavzu o\'ziga bog\'liq bo\'lolmaydi');
    const [a, b] = await Promise.all([this.get(topicId), this.get(dto.prerequisiteId)]);
    if (a.subjectId !== b.subjectId) throw new BadRequestException('Mavzular bitta fanga tegishli bo\'lishi kerak');

    const edges = await this.prisma.topicDependency.findMany({
      where: { topic: { subjectId: a.subjectId } },
      select: { topicId: true, prerequisiteId: true },
    });
    // prerequisite'dan uning prerequisite'lari bo'ylab yursak topicId'ga yetib borsak — sikl paydo bo'ladi
    const graph = new Map<string, string[]>();
    for (const e of edges) graph.set(e.topicId, [...(graph.get(e.topicId) ?? []), e.prerequisiteId]);
    const stack = [dto.prerequisiteId];
    const seen = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === topicId) throw new BadRequestException('Bu bog\'liqlik aylanma (cycle) hosil qiladi');
      if (seen.has(cur)) continue;
      seen.add(cur);
      stack.push(...(graph.get(cur) ?? []));
    }

    return this.prisma.topicDependency.create({ data: { topicId, prerequisiteId: dto.prerequisiteId, weight: dto.weight ?? 1 } });
  }

  removeDependency(topicId: string, prerequisiteId: string) {
    return this.prisma.topicDependency.delete({ where: { topicId_prerequisiteId: { topicId, prerequisiteId } } });
  }

  addObjective(topicId: string, dto: CreateObjectiveDto) {
    return this.prisma.learningObjective.create({ data: { topicId, title: dto.title } });
  }

  materials(topicId: string) {
    return this.prisma.learningMaterial.findMany({
      where: { topicId, status: 'APPROVED' },
      select: { id: true, type: true, title: true, content: true, url: true },
    });
  }

  addMaterial(topicId: string, dto: CreateMaterialDto) {
    return this.prisma.learningMaterial.create({ data: { topicId, ...dto, status: 'APPROVED' } });
  }
}

@ApiTags('topics')
@Controller('topics')
export class TopicsController {
  constructor(private readonly t: TopicsService) {}

  @Public() @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.t.get(id); }
  @Public() @Get(':id/dependencies') deps(@Param('id', ParseUUIDPipe) id: string) { return this.t.dependencies(id); }
  @Public() @Get(':id/materials') materials(@Param('id', ParseUUIDPipe) id: string) { return this.t.materials(id); }

  @ApiBearerAuth() @RequirePermissions(P.topicsManage)
  @Post() create(@Body() dto: CreateTopicDto) { return this.t.create(dto); }

  @ApiBearerAuth() @RequirePermissions(P.topicsManage)
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTopicDto) { return this.t.update(id, dto); }

  @ApiBearerAuth() @RequirePermissions(P.topicsManage)
  @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string) { return this.t.remove(id); }

  @ApiBearerAuth() @RequirePermissions(P.topicsManage)
  @Post(':id/dependencies')
  addDep(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddDependencyDto) { return this.t.addDependency(id, dto); }

  @ApiBearerAuth() @RequirePermissions(P.topicsManage)
  @Delete(':id/dependencies/:prerequisiteId')
  removeDep(@Param('id', ParseUUIDPipe) id: string, @Param('prerequisiteId', ParseUUIDPipe) pid: string) {
    return this.t.removeDependency(id, pid);
  }

  @ApiBearerAuth() @RequirePermissions(P.topicsManage)
  @Post(':id/objectives')
  addObjective(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateObjectiveDto) { return this.t.addObjective(id, dto); }

  @ApiBearerAuth() @RequirePermissions(P.topicsManage)
  @Post(':id/materials')
  addMaterial(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateMaterialDto) { return this.t.addMaterial(id, dto); }
}

@Module({ controllers: [TopicsController], providers: [TopicsService] })
export class TopicsModule {}
