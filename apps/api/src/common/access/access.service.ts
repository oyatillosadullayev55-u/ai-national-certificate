import { ForbiddenException, Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Ruxsatlarni hisoblash: global rollar + (berilgan bo'lsa) shu tashkilot doirasidagi rollar.
 * Resurs darajasidagi tekshiruvlar (teacher↔student, parent↔child) ham shu yerda.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getPermissions(userId: string, organizationId?: string | null): Promise<{ isSuperAdmin: boolean; permissions: Set<string> }> {
    const roles = await this.prisma.userRole.findMany({
      where: {
        userId,
        OR: [{ organizationId: null }, ...(organizationId ? [{ organizationId }] : [])],
      },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    const permissions = new Set<string>();
    let isSuperAdmin = false;
    for (const ur of roles) {
      if (ur.role.key === 'super_admin') isSuperAdmin = true;
      for (const rp of ur.role.permissions) permissions.add(rp.permission.key);
    }
    return { isSuperAdmin, permissions };
  }

  async hasPermission(userId: string, permission: string, organizationId?: string | null): Promise<boolean> {
    const { isSuperAdmin, permissions } = await this.getPermissions(userId, organizationId);
    return isSuperAdmin || permissions.has(permission);
  }

  async assertPermission(userId: string, permission: string, organizationId?: string | null) {
    if (!(await this.hasPermission(userId, permission, organizationId))) {
      throw new ForbiddenException('Ruxsat yetarli emas');
    }
  }

  async isOrgMember(userId: string, organizationId: string): Promise<boolean> {
    const m = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    return !!m;
  }

  async assertOrgMember(userId: string, organizationId: string) {
    if (!(await this.isOrgMember(userId, organizationId)) && !(await this.getPermissions(userId)).isSuperAdmin) {
      throw new ForbiddenException('Siz bu tashkilot a\'zosi emassiz');
    }
  }

  /** O'qituvchi o'quvchini o'zining biror guruhi orqali o'qitadimi */
  async teacherTeachesStudent(teacherId: string, studentId: string): Promise<boolean> {
    const count = await this.prisma.groupMember.count({
      where: { studentId, group: { deletedAt: null, teachers: { some: { teacherId } } } },
    });
    return count > 0;
  }

  async parentOfStudent(parentId: string, studentId: string): Promise<boolean> {
    const link = await this.prisma.parentStudentLink.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
    });
    return link?.status === 'ACTIVE';
  }

  /** Talaba ma'lumotini ko'rish: o'zi, ota-onasi, o'qituvchisi yoki admin */
  async assertCanViewStudent(viewerId: string, studentId: string) {
    if (viewerId === studentId) return;
    if (await this.parentOfStudent(viewerId, studentId)) return;
    if (await this.teacherTeachesStudent(viewerId, studentId)) return;
    if (await this.hasPermission(viewerId, 'users:read')) return;
    throw new ForbiddenException('Bu o\'quvchi ma\'lumotlarini ko\'rish huquqi yo\'q');
  }
}

@Global()
@Module({ providers: [AccessService], exports: [AccessService] })
export class AccessModule {}
