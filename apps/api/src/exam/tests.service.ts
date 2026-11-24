import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Test } from '@prisma/client';
import { randomInt } from 'crypto';
import { AccessService } from '../common/access/access.service';
import { pageArgs, paged } from '../common/http';
import { P } from '../common/permissions';
import { PrismaService } from '../common/prisma/prisma.service';
import { AssignTestDto, AutoPickDto, CreateTestDto, PracticeDto, TestQueryDto } from './exam.dto';

interface SpecSection {
  title?: string;
  topicIds?: string[];
  count: number;
  points?: number;
  types?: string[];
  difficultyMin?: number;
  difficultyMax?: number;
}

@Injectable()
export class TestsService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessService) {}

  async create(userId: string, dto: CreateTestDto) {
    await this.access.assertPermission(userId, P.testsCreate, dto.organizationId);

    let picked: { id: string; points: number }[] = [];
    let durationSec = dto.durationSec;

    if (dto.examSpecId) {
      const spec = await this.prisma.examSpec.findFirst({ where: { id: dto.examSpecId, subjectId: dto.subjectId } });
      if (!spec) throw new BadRequestException('Imtihon spetsifikatsiyasi topilmadi');
      const cfg = spec.config as { durationSec?: number; sections?: SpecSection[] };
      durationSec ??= cfg.durationSec;
      const used = new Set<string>();
      for (const s of cfg.sections ?? []) {
        const ids = await this.pickVersions(dto.subjectId, dto.organizationId, { ...s, topicIds: s.topicIds }, s.types, used);
        if (ids.length < s.count) throw new BadRequestException(`"${s.title ?? 'bo\'lim'}" uchun tasdiqlangan savollar yetarli emas (${ids.length}/${s.count})`);
        ids.forEach((id) => used.add(id));
        picked.push(...ids.map((id) => ({ id, points: s.points ?? 1 })));
      }
    } else if (dto.questionVersionIds?.length) {
      const valid = await this.prisma.questionVersion.findMany({
        where: {
          id: { in: dto.questionVersionIds }, status: 'APPROVED',
          question: { subjectId: dto.subjectId, deletedAt: null, OR: [{ organizationId: null }, { organizationId: dto.organizationId ?? undefined }] },
        },
        select: { id: true, points: true },
      });
      if (valid.length !== new Set(dto.questionVersionIds).size) {
        throw new BadRequestException('Ba\'zi savollar topilmadi yoki tasdiqlanmagan');
      }
      const pts = new Map(valid.map((v) => [v.id, Number(v.points)]));
      picked = [...new Set(dto.questionVersionIds)].map((id) => ({ id, points: pts.get(id)! }));
    } else if (dto.auto) {
      const ids = await this.pickVersions(dto.subjectId, dto.organizationId, dto.auto);
      if (ids.length === 0) throw new BadRequestException('Mos tasdiqlangan savollar topilmadi');
      picked = ids.map((id) => ({ id, points: 1 }));
    } else {
      throw new BadRequestException('questionVersionIds, auto yoki examSpecId dan biri kerak');
    }

    return this.prisma.test.create({
      data: {
        title: dto.title, mode: dto.mode, subjectId: dto.subjectId, organizationId: dto.organizationId,
        examSpecId: dto.examSpecId, createdById: userId, durationSec, shuffle: dto.shuffle ?? dto.mode !== 'MOCK_EXAM',
        questions: { create: picked.map((p, i) => ({ questionVersionId: p.id, sortOrder: i, points: p.points })) },
      },
      include: { _count: { select: { questions: true } } },
    });
  }

  /** O'quvchining o'zi uchun tezkor mashq testi */
  async createPractice(userId: string, dto: PracticeDto) {
    const ids = await this.pickVersions(dto.subjectId, null, { topicIds: dto.topicIds, count: dto.count ?? 10 });
    if (ids.length === 0) throw new BadRequestException('Bu mavzular bo\'yicha tasdiqlangan savollar hali yo\'q');
    return this.prisma.test.create({
      data: {
        title: 'Mashq', mode: 'PRACTICE', status: 'PUBLISHED', subjectId: dto.subjectId, createdById: userId, shuffle: true,
        questions: { create: ids.map((id, i) => ({ questionVersionId: id, sortOrder: i })) },
      },
    });
  }

  async publish(userId: string, testId: string) {
    const t = await this.getRaw(testId);
    await this.access.assertPermission(userId, P.testsPublish, t.organizationId);
    return this.prisma.test.update({ where: { id: testId }, data: { status: 'PUBLISHED' } });
  }

  async list(userId: string, q: TestQueryDto) {
    if (q.organizationId) await this.access.assertOrgMember(userId, q.organizationId);
    const where: Prisma.TestWhereInput = {
      deletedAt: null,
      status: 'PUBLISHED',
      subjectId: q.subjectId,
      mode: q.mode ?? { notIn: ['PRACTICE', 'REVISION'] },
      organizationId: q.organizationId ?? null,
    };
    const [items, total] = await Promise.all([
      this.prisma.test.findMany({
        where, ...pageArgs(q), orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, mode: true, subjectId: true, durationSec: true, createdAt: true, _count: { select: { questions: true } } },
      }),
      this.prisma.test.count({ where }),
    ]);
    return paged(items, total, q);
  }

  async get(userId: string, id: string) {
    const t = await this.prisma.test.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { questions: true } }, subject: { select: { id: true, nameUz: true, nameRu: true } } },
    });
    if (!t) throw new NotFoundException('Test topilmadi');
    await this.assertCanTake(userId, t);
    return t;
  }

  async assign(userId: string, testId: string, dto: AssignTestDto) {
    const t = await this.getRaw(testId);
    if (!t.organizationId) throw new BadRequestException('Faqat tashkilot testini topshiriq qilib berish mumkin');
    await this.access.assertPermission(userId, P.testsAssign, t.organizationId);
    if (!dto.groupId && !dto.studentIds?.length) throw new BadRequestException('groupId yoki studentIds kerak');

    if (dto.groupId) {
      const g = await this.prisma.group.findFirst({ where: { id: dto.groupId, organizationId: t.organizationId, deletedAt: null } });
      if (!g) throw new BadRequestException('Guruh bu tashkilotga tegishli emas');
    }
    if (dto.studentIds?.length) {
      const members = await this.prisma.organizationMember.count({ where: { organizationId: t.organizationId, userId: { in: dto.studentIds } } });
      if (members !== dto.studentIds.length) throw new BadRequestException('Ba\'zi o\'quvchilar tashkilot a\'zosi emas');
    }
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : undefined;
    const rows = [
      ...(dto.groupId ? [{ testId, groupId: dto.groupId, assignedById: userId, dueAt }] : []),
      ...(dto.studentIds ?? []).map((studentId) => ({ testId, studentId, assignedById: userId, dueAt })),
    ];
    await this.prisma.testAssignment.createMany({ data: rows });
    if (t.status !== 'PUBLISHED') await this.prisma.test.update({ where: { id: testId }, data: { status: 'PUBLISHED' } });
    return { assigned: rows.length };
  }

  myAssignments(userId: string) {
    return this.prisma.testAssignment.findMany({
      where: { OR: [{ studentId: userId }, { group: { members: { some: { studentId: userId } } } }], test: { deletedAt: null } },
      include: {
        test: {
          select: {
            id: true, title: true, mode: true, durationSec: true,
            attempts: { where: { userId }, select: { id: true, status: true, score: true, maxScore: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Test yechish huquqi: ochiq platforma testi, o'zi yaratgan mashq, tashkilot a'zosi yoki topshiriq berilgan */
  async assertCanTake(userId: string, t: Test) {
    if (t.status !== 'PUBLISHED' && t.createdById !== userId) throw new ForbiddenException('Test hali nashr qilinmagan');
    if ((t.mode === 'PRACTICE' || t.mode === 'REVISION') && t.createdById !== userId) throw new ForbiddenException();
    if (!t.organizationId) return;
    if (await this.access.isOrgMember(userId, t.organizationId)) return;
    const assigned = await this.prisma.testAssignment.count({
      where: { testId: t.id, OR: [{ studentId: userId }, { group: { members: { some: { studentId: userId } } } }] },
    });
    if (!assigned) throw new ForbiddenException('Bu test sizga berilmagan');
  }

  async getRaw(id: string) {
    const t = await this.prisma.test.findFirst({ where: { id, deletedAt: null } });
    if (!t) throw new NotFoundException('Test topilmadi');
    return t;
  }

  /** Tasdiqlangan, joriy savol versiyalaridan tasodifiy tanlash */
  private async pickVersions(
    subjectId: string,
    organizationId: string | null | undefined,
    pick: AutoPickDto,
    types?: string[],
    exclude: Set<string> = new Set(),
  ): Promise<string[]> {
    const rows = await this.prisma.question.findMany({
      where: {
        subjectId,
        deletedAt: null,
        status: 'APPROVED',
        currentVersionId: { not: null },
        ...(pick.topicIds?.length ? { OR: [{ topicId: { in: pick.topicIds } }, { topic: { parentId: { in: pick.topicIds } } }] } : {}),
        ...(types?.length ? { type: { in: types as any } } : {}),
        AND: [
          { OR: [{ organizationId: null }, ...(organizationId ? [{ organizationId }] : [])] },
          ...(pick.difficultyMin || pick.difficultyMax
            ? [{ currentVersion: { difficulty: { gte: pick.difficultyMin ?? 1, lte: pick.difficultyMax ?? 5 } } }]
            : []),
        ],
      },
      select: { currentVersionId: true },
      take: 2000,
    });
    const ids = rows.map((r) => r.currentVersionId!).filter((id) => !exclude.has(id));
    for (let i = ids.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids.slice(0, pick.count);
  }
}
