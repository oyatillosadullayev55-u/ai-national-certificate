import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsUUID, Matches } from 'class-validator';
import { AccessService } from '../common/access/access.service';
import { AuthUser, CurrentUser } from '../common/decorators';
import { PrismaService } from '../common/prisma/prisma.service';

const WEAK = 0.5;
const STRONG = 0.8;

export class SubjectQueryDto {
  @ApiProperty() @IsUUID() subjectId: string;
}

export class LinkChildDto {
  @ApiProperty({ example: '+998901234567' }) @Matches(/^\+998\d{9}$/) phone: string;
}

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessService) {}

  /**
   * Knowledge Map: har bir mavzu o'zlashtirishi + prerequisite bo'shliqlari.
   * Agar mavzu zaif bo'lsa va uning prerequisite'i ham zaif bo'lsa — avval prerequisite tavsiya qilinadi.
   */
  async knowledgeMap(viewerId: string, studentId: string, subjectId: string) {
    await this.access.assertCanViewStudent(viewerId, studentId);
    const [topics, progress, deps] = await Promise.all([
      this.prisma.topic.findMany({ where: { subjectId, deletedAt: null }, select: { id: true, name: true, parentId: true, level: true, sortOrder: true } }),
      this.prisma.studentProgress.findMany({ where: { userId: studentId, topic: { subjectId } } }),
      this.prisma.topicDependency.findMany({ where: { topic: { subjectId } } }),
    ]);
    const pm = new Map(progress.map((p) => [p.topicId, p]));
    const prereqs = new Map<string, string[]>();
    deps.forEach((d) => prereqs.set(d.topicId, [...(prereqs.get(d.topicId) ?? []), d.prerequisiteId]));
    const name = new Map(topics.map((t) => [t.id, t.name]));

    const status = (id: string) => {
      const p = pm.get(id);
      if (!p || p.answered === 0) return 'not_started';
      if (p.mastery >= STRONG) return 'mastered';
      if (p.mastery < WEAK) return 'weak';
      return 'learning';
    };

    const nodes = topics.map((t) => {
      const p = pm.get(t.id);
      const gaps = (prereqs.get(t.id) ?? []).filter((pid) => status(pid) === 'weak' || status(pid) === 'not_started');
      return {
        ...t,
        mastery: p ? Math.round(p.mastery * 100) / 100 : null,
        answered: p?.answered ?? 0,
        accuracy: p && p.answered ? Math.round((p.correct / p.answered) * 100) : null,
        status: status(t.id),
        prerequisiteGaps: gaps.map((id) => ({ id, name: name.get(id) })),
      };
    });

    // Tavsiya: zaif mavzular, prerequisite bo'shlig'i bo'lsa — prerequisite birinchi
    const recommendations: { topicId: string; name?: string; reason: string }[] = [];
    const added = new Set<string>();
    for (const n of nodes.filter((x) => x.status === 'weak').sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0))) {
      for (const g of n.prerequisiteGaps) {
        if (!added.has(g.id)) {
          recommendations.push({ topicId: g.id, name: g.name, reason: `"${n.name}" uchun asos bo'luvchi mavzu` });
          added.add(g.id);
        }
      }
      if (!added.has(n.id)) {
        recommendations.push({ topicId: n.id, name: n.name, reason: 'O\'zlashtirish past' });
        added.add(n.id);
      }
    }

    return {
      subjectId,
      overall: progress.length ? Math.round((progress.reduce((s, p) => s + p.mastery, 0) / topics.length) * 100) : 0,
      nodes,
      edges: deps.map((d) => ({ from: d.prerequisiteId, to: d.topicId })),
      recommendations: recommendations.slice(0, 5),
    };
  }

  async dashboard(userId: string) {
    const [subjects, attempts, dueErrors, profile, weak] = await Promise.all([
      this.prisma.studentSubject.findMany({ where: { userId }, include: { subject: { select: { id: true, nameUz: true, nameRu: true, icon: true } } } }),
      this.prisma.examAttempt.findMany({
        where: { userId, status: { not: 'IN_PROGRESS' } }, orderBy: { submittedAt: 'desc' }, take: 5,
        select: { id: true, score: true, maxScore: true, submittedAt: true, test: { select: { title: true, mode: true } } },
      }),
      this.prisma.errorNotebookEntry.count({ where: { userId, status: { not: 'RESOLVED' }, nextReviewAt: { lte: new Date() } } }),
      this.prisma.studentProfile.findUnique({ where: { userId } }),
      this.prisma.studentProgress.findMany({
        where: { userId, mastery: { lt: WEAK }, answered: { gte: 3 } }, orderBy: { mastery: 'asc' }, take: 5,
        include: { topic: { select: { name: true, subjectId: true } } },
      }),
    ]);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const weekly = await this.prisma.answer.count({ where: { attempt: { userId }, updatedAt: { gte: weekAgo } } });
    return {
      subjects,
      examDate: profile?.examDate ?? null,
      daysToExam: profile?.examDate ? Math.max(0, Math.ceil((profile.examDate.getTime() - Date.now()) / 86_400_000)) : null,
      recentResults: attempts.map((a) => ({ ...a, percent: a.maxScore && Number(a.maxScore) > 0 ? Math.round((Number(a.score) / Number(a.maxScore)) * 100) : 0 })),
      errorsDueToday: dueErrors,
      weakTopics: weak.map((w) => ({ topicId: w.topicId, name: w.topic.name, subjectId: w.topic.subjectId, mastery: w.mastery })),
      answersThisWeek: weekly,
    };
  }

  // ───────────── Parent ↔ child ─────────────

  async requestChildLink(parentId: string, dto: LinkChildDto) {
    const child = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!child) throw new NotFoundException('Bu raqam bilan o\'quvchi topilmadi');
    return this.prisma.parentStudentLink.upsert({
      where: { parentId_studentId: { parentId, studentId: child.id } },
      create: { parentId, studentId: child.id },
      update: {},
      select: { id: true, status: true },
    });
  }

  /** Bog'lanish faqat o'quvchi tasdiqlagach faollashadi */
  async approveParent(studentId: string, linkId: string) {
    const r = await this.prisma.parentStudentLink.updateMany({
      where: { id: linkId, studentId, status: 'PENDING' },
      data: { status: 'ACTIVE', verifiedAt: new Date() },
    });
    if (!r.count) throw new NotFoundException('So\'rov topilmadi');
    return { ok: true };
  }

  pendingParentRequests(studentId: string) {
    return this.prisma.parentStudentLink.findMany({
      where: { studentId, status: 'PENDING' },
      include: { parent: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } } },
    });
  }

  children(parentId: string) {
    return this.prisma.parentStudentLink.findMany({
      where: { parentId, status: 'ACTIVE' },
      include: { student: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } } },
    });
  }
}

@ApiTags('students')
@ApiBearerAuth()
@Controller()
export class ProgressController {
  constructor(private readonly s: ProgressService) {}

  @Get('students/me/dashboard') dashboard(@CurrentUser() u: AuthUser) { return this.s.dashboard(u.id); }

  @Get('students/me/knowledge-map')
  myMap(@CurrentUser() u: AuthUser, @Query() q: SubjectQueryDto) { return this.s.knowledgeMap(u.id, u.id, q.subjectId); }

  @Get('students/:id/knowledge-map')
  map(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: SubjectQueryDto) {
    return this.s.knowledgeMap(u.id, id, q.subjectId);
  }

  @Get('students/me/parent-requests') pending(@CurrentUser() u: AuthUser) { return this.s.pendingParentRequests(u.id); }

  @Post('students/me/parent-requests/:id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.approveParent(u.id, id); }

  @Post('parents/children') link(@CurrentUser() u: AuthUser, @Body() dto: LinkChildDto) { return this.s.requestChildLink(u.id, dto); }

  @Get('parents/children') children(@CurrentUser() u: AuthUser) { return this.s.children(u.id); }
}

@Module({ controllers: [ProgressController], providers: [ProgressService] })
export class ProgressModule {}
