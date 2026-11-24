/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { ALL_PERMISSIONS, ROLE_DEFINITIONS } from '../src/common/permissions';

const prisma = new PrismaClient();

const SUBJECTS = [
  ['math', 'Matematika', 'Математика'],
  ['physics', 'Fizika', 'Физика'],
  ['chemistry', 'Kimyo', 'Химия'],
  ['biology', 'Biologiya', 'Биология'],
  ['history', 'Tarix', 'История'],
  ['geography', 'Geografiya', 'География'],
  ['uzbek_lit', 'Ona tili va adabiyot', 'Родной язык и литература'],
  ['russian', 'Rus tili', 'Русский язык'],
  ['karakalpak', 'Qoraqalpoq tili', 'Каракалпакский язык'],
] as const;

async function main() {
  // 1. Ruxsatlar va rollar
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, create: { key }, update: {} });
  }
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.key, p.id]));
  for (const [key, def] of Object.entries(ROLE_DEFINITIONS)) {
    const role = await prisma.role.upsert({ where: { key }, create: { key, name: def.name, scope: def.scope }, update: { name: def.name, scope: def.scope } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: def.permissions.map((p) => ({ roleId: role.id, permissionId: perms.get(p)! })) });
  }
  console.log(`✓ ${Object.keys(ROLE_DEFINITIONS).length} rol, ${ALL_PERMISSIONS.length} ruxsat`);

  // 2. Fanlar
  for (const [i, [code, nameUz, nameRu]] of SUBJECTS.entries()) {
    await prisma.subject.upsert({ where: { code }, create: { code, nameUz, nameRu, sortOrder: i }, update: { nameUz, nameRu } });
  }
  console.log(`✓ ${SUBJECTS.length} fan`);

  // 3. Super admin
  const phone = process.env.SEED_ADMIN_PHONE ?? '+998900000000';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const superRole = await prisma.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
  const admin = await prisma.user.upsert({
    where: { phone },
    create: { phone, passwordHash: await argon2.hash(password, { type: argon2.argon2id }), profile: { create: { firstName: 'Super', lastName: 'Admin' } } },
    update: {},
  });
  if (!(await prisma.userRole.findFirst({ where: { userId: admin.id, roleId: superRole.id } }))) {
    await prisma.userRole.create({ data: { userId: admin.id, roleId: superRole.id } });
  }
  console.log(`✓ super admin: ${phone}`);

  // 4. Namuna: Matematika mavzulari, bog'liqlik va tasdiqlangan savollar
  const math = await prisma.subject.findUniqueOrThrow({ where: { code: 'math' } });
  if ((await prisma.topic.count({ where: { subjectId: math.id } })) === 0) {
    const algebra = await prisma.topic.create({ data: { subjectId: math.id, name: 'Algebra', sortOrder: 0 } });
    const eq = await prisma.topic.create({ data: { subjectId: math.id, parentId: algebra.id, level: 'SUBTOPIC', name: 'Tenglamalar', sortOrder: 0 } });
    const ineq = await prisma.topic.create({ data: { subjectId: math.id, parentId: algebra.id, level: 'SUBTOPIC', name: 'Tengsizliklar', sortOrder: 1 } });
    const fn = await prisma.topic.create({ data: { subjectId: math.id, parentId: algebra.id, level: 'SUBTOPIC', name: 'Funksiyalar', sortOrder: 2 } });
    const geo = await prisma.topic.create({ data: { subjectId: math.id, name: 'Geometriya', sortOrder: 1 } });
    await prisma.topic.createMany({
      data: ['Uchburchaklar', 'Aylana', 'Hajmlar'].map((name, i) => ({ subjectId: math.id, parentId: geo.id, level: 'SUBTOPIC' as const, name, sortOrder: i })),
    });
    await prisma.topicDependency.createMany({
      data: [
        { topicId: ineq.id, prerequisiteId: eq.id },
        { topicId: fn.id, prerequisiteId: eq.id },
      ],
    });

    const samples = [
      { topicId: eq.id, stem: '$2x + 6 = 14$ tenglamani yeching.', options: [['A', '3', false], ['B', '4', true], ['C', '10', false], ['D', '7', false]], solution: '$2x = 14 - 6 = 8$, $x = 4$.' },
      { topicId: eq.id, stem: '$x^2 - 9 = 0$ tenglamaning musbat ildizini toping.', options: [['A', '3', true], ['B', '9', false], ['C', '-3', false], ['D', '81', false]], solution: '$x^2 = 9$, $x = \\pm 3$. Musbat ildiz: 3.' },
      { topicId: ineq.id, stem: '$3x - 5 > 4$ tengsizlikning yechimi:', options: [['A', '$x > 3$', true], ['B', '$x < 3$', false], ['C', '$x > 1/3$', false], ['D', '$x \\ge 3$', false]], solution: '$3x > 9$, $x > 3$.' },
    ];
    for (const s of samples) {
      const q = await prisma.question.create({
        data: { subjectId: math.id, topicId: s.topicId, type: 'SINGLE_CHOICE', status: 'APPROVED', authorId: admin.id, source: 'seed', copyrightStatus: 'ORIGINAL' },
      });
      const v = await prisma.questionVersion.create({
        data: {
          questionId: q.id, version: 1, stem: s.stem, solution: s.solution, status: 'APPROVED', createdById: admin.id, difficulty: 2,
          options: { create: s.options.map(([label, content, isCorrect], i) => ({ label: label as string, content: content as string, isCorrect: isCorrect as boolean, sortOrder: i })) },
        },
      });
      await prisma.question.update({ where: { id: q.id }, data: { currentVersionId: v.id } });
    }
    const numeric = await prisma.question.create({
      data: { subjectId: math.id, topicId: eq.id, type: 'NUMERIC', status: 'APPROVED', authorId: admin.id, source: 'seed', copyrightStatus: 'ORIGINAL' },
    });
    const nv = await prisma.questionVersion.create({
      data: {
        questionId: numeric.id, version: 1, stem: '$\\frac{x}{4} = 0{,}75$ bo\'lsa, $x$ ni toping.', answerKey: { value: 3, tolerance: 0.001 },
        solution: '$x = 0{,}75 \\cdot 4 = 3$.', status: 'APPROVED', createdById: admin.id, difficulty: 1,
      },
    });
    await prisma.question.update({ where: { id: numeric.id }, data: { currentVersionId: nv.id } });
    console.log('✓ Matematika: namuna mavzular va 4 ta savol');

    // Namuna mock imtihon (vaqt bilan) — mobil ilovada "Testlar" bo'limida ko'rinadi
    const versions = await prisma.question.findMany({ where: { subjectId: math.id, status: 'APPROVED' }, select: { currentVersionId: true } });
    await prisma.test.create({
      data: {
        title: 'Matematika — namuna mock imtihon', mode: 'MOCK_EXAM', status: 'PUBLISHED', subjectId: math.id,
        createdById: admin.id, durationSec: 20 * 60, shuffle: false,
        questions: { create: versions.map((v, i) => ({ questionVersionId: v.currentVersionId!, sortOrder: i })) },
      },
    });
    console.log('✓ namuna mock imtihon');
  }

  // 5. Tariflar (narxlar tiyinda — taxminiy, biznes tasdiqlashi kerak)
  const plans = [
    ['free', 'Free', 0n, { aiMessagesPerDay: 20, mockExamsPerMonth: 1 }],
    ['start', 'Start', 4_900_000n, { aiMessagesPerDay: 50, mockExamsPerMonth: 4 }],
    ['pro', 'Pro', 9_900_000n, { aiMessagesPerDay: 150, mockExamsPerMonth: 12 }],
    ['premium', 'Premium', 19_900_000n, { aiMessagesPerDay: 400, mockExamsPerMonth: 100 }],
  ] as const;
  for (const [code, name, priceMinor, limits] of plans) {
    await prisma.subscriptionPlan.upsert({ where: { code }, create: { code, name, priceMinor, limits }, update: {} });
  }
  console.log('✓ tariflar');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
