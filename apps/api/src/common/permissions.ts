/** Platformadagi barcha ruxsatlar ro'yxati. Seed shu ro'yxatdan foydalanadi. */
export const P = {
  usersRead: 'users:read',
  usersManage: 'users:manage',
  rolesManage: 'roles:manage',
  subjectsManage: 'subjects:manage',
  topicsManage: 'topics:manage',
  questionsCreate: 'questions:create',
  questionsRead: 'questions:read',
  questionsReadKeys: 'questions:read_keys',
  questionsReview: 'questions:review',
  questionsImport: 'questions:import',
  examSpecsManage: 'exam_specs:manage',
  testsCreate: 'tests:create',
  testsPublish: 'tests:publish',
  testsAssign: 'tests:assign',
  orgManage: 'org:manage',
  orgMembersManage: 'org:members_manage',
  groupsManage: 'groups:manage',
  orgAnalyticsRead: 'org:analytics_read',
  aiUsageRead: 'ai:usage_read',
  auditRead: 'audit:read',
  paymentsRead: 'payments:read',
} as const;

export const ALL_PERMISSIONS = Object.values(P);

/** Rol → ruxsatlar. super_admin hamma narsaga ega (guard'da bypass). */
export const ROLE_DEFINITIONS: Record<string, { name: string; scope: 'GLOBAL' | 'ORGANIZATION'; permissions: string[] }> = {
  super_admin: { name: 'Super Admin', scope: 'GLOBAL', permissions: ALL_PERMISSIONS },
  admin: {
    name: 'Admin',
    scope: 'GLOBAL',
    permissions: [P.usersRead, P.usersManage, P.questionsRead, P.aiUsageRead, P.auditRead, P.paymentsRead, P.orgAnalyticsRead],
  },
  content_manager: {
    name: 'Content Manager',
    scope: 'GLOBAL',
    permissions: [P.subjectsManage, P.topicsManage, P.questionsCreate, P.questionsRead, P.questionsReadKeys, P.questionsImport, P.testsCreate, P.testsPublish],
  },
  subject_expert: {
    name: 'Subject Expert',
    scope: 'GLOBAL',
    permissions: [P.questionsCreate, P.questionsRead, P.questionsReadKeys, P.questionsReview],
  },
  methodologist: {
    name: 'Methodologist',
    scope: 'GLOBAL',
    permissions: [P.questionsRead, P.questionsReadKeys, P.questionsReview, P.examSpecsManage, P.testsPublish],
  },
  support_agent: { name: 'Support Agent', scope: 'GLOBAL', permissions: [P.usersRead] },
  student: { name: 'Student', scope: 'GLOBAL', permissions: [] },
  parent: { name: 'Parent', scope: 'GLOBAL', permissions: [] },
  center_owner: {
    name: 'Center Owner',
    scope: 'ORGANIZATION',
    permissions: [P.orgManage, P.orgMembersManage, P.groupsManage, P.orgAnalyticsRead, P.testsCreate, P.testsAssign, P.testsPublish, P.questionsCreate],
  },
  center_manager: {
    name: 'Center Manager',
    scope: 'ORGANIZATION',
    permissions: [P.orgMembersManage, P.groupsManage, P.orgAnalyticsRead, P.testsAssign],
  },
  teacher: {
    name: 'Teacher',
    scope: 'ORGANIZATION',
    permissions: [P.groupsManage, P.testsCreate, P.testsAssign, P.testsPublish, P.questionsCreate],
  },
};
