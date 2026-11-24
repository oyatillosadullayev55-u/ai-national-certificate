/**
 * Kritik xavfsizlik testlari (PRD 10.4, 13): access control, IDOR, tenant isolation,
 * javob kaliti oshkor bo'lmasligi, idempotentlik, refresh token o'g'irlanishi.
 *
 * Haqiqiy PostgreSQL kerak: DATABASE_URL, `prisma db push` va `npm run seed` dan keyin
 *   npm run test:e2e
 */
process.env.OTP_DEV_ECHO = 'true';
process.env.NODE_ENV = 'test';

import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const api = '/api/v1';
const rndPhone = () => `+99890${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;

describe('Security (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let mathId: string;
  const A = { phone: rndPhone(), token: '', refresh: '', id: '' };
  const B = { phone: rndPhone(), token: '', refresh: '', id: '' };
  const admin = { token: '' };

  async function register(u: typeof A, accountType = 'student') {
    const otp = await http.post(`${api}/auth/send-otp`).send({ phone: u.phone, purpose: 'REGISTER' }).expect(200);
    const v = await http.post(`${api}/auth/verify-otp`).send({ phone: u.phone, purpose: 'REGISTER', code: otp.body.devCode }).expect(200);
    const r = await http
      .post(`${api}/auth/register`)
      .send({ verificationToken: v.body.verificationToken, password: 'Parol12345', firstName: 'Test', accountType })
      .expect(201);
    u.token = r.body.accessToken;
    u.refresh = r.body.refreshToken;
    u.id = (await http.get(`${api}/auth/me`).set(auth(u.token)).expect(200)).body.id;
  }
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    http = request(app.getHttpServer());

    await register(A);
    await register(B);
    const login = await http
      .post(`${api}/auth/login`)
      .send({ login: process.env.SEED_ADMIN_PHONE ?? '+998900000000', password: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!' })
      .expect(200);
    admin.token = login.body.accessToken;
    mathId = (await http.get(`${api}/subjects`).expect(200)).body.find((s: any) => s.code === 'math').id;
  });

  afterAll(() => app.close());

  it('token yo\'q → 401, standart xato formati', async () => {
    const r = await http.get(`${api}/auth/me`).expect(401);
    expect(r.body.error.code).toBe('UNAUTHORIZED');
    expect(r.body.requestId).toBeDefined();
  });

  it('student admin/kontent endpointlariga kira olmaydi', async () => {
    await http.get(`${api}/admin/dashboard`).set(auth(A.token)).expect(403);
    await http.get(`${api}/questions`).set(auth(A.token)).expect(403);
    await http.post(`${api}/subjects`).set(auth(A.token)).send({ code: 'hack', nameUz: 'x', nameRu: 'x' }).expect(403);
    await http.post(`${api}/admin/users/${A.id}/roles`).set(auth(A.token)).send({ roleKey: 'super_admin' }).expect(403);
  });

  describe('test oqimi', () => {
    let attempt: any;

    beforeAll(async () => {
      attempt = (await http.post(`${api}/tests/practice`).set(auth(A.token)).send({ subjectId: mathId, count: 4 }).expect(201)).body;
    });

    it('test davomida javob kaliti mijozga yuborilmaydi', () => {
      const raw = JSON.stringify(attempt);
      expect(raw).not.toMatch(/isCorrect|answerKey|"solution"|"explanation"/);
      expect(attempt.questions.length).toBeGreaterThan(0);
    });

    it('javob saqlash idempotent', async () => {
      const q = attempt.questions[0];
      const body = { response: { optionId: '00000000-0000-4000-8000-000000000000' }, timeSpentMs: 9000 };
      await http.put(`${api}/attempts/${attempt.id}/answers/${q.questionVersionId}`).set(auth(A.token)).send(body).expect(200);
      await http.put(`${api}/attempts/${attempt.id}/answers/${q.questionVersionId}`).set(auth(A.token)).send(body).expect(200);
      const v = await http.get(`${api}/attempts/${attempt.id}`).set(auth(A.token)).expect(200);
      expect(v.body.answers.filter((a: any) => a.questionVersionId === q.questionVersionId)).toHaveLength(1);
    });

    it('IDOR: boshqa o\'quvchi urinishni ko\'ra olmaydi va javob yoza olmaydi', async () => {
      const q = attempt.questions[0];
      await http.get(`${api}/attempts/${attempt.id}`).set(auth(B.token)).expect(403);
      await http.put(`${api}/attempts/${attempt.id}/answers/${q.questionVersionId}`).set(auth(B.token)).send({ response: { optionId: 'x' } }).expect(403);
      await http.post(`${api}/attempts/${attempt.id}/submit`).set(auth(B.token)).expect(403);
      await http.get(`${api}/attempts/${attempt.id}/result`).set(auth(B.token)).expect(403);
    });

    it('yakunlash idempotent, natija va xatolar daftari', async () => {
      const r1 = await http.post(`${api}/attempts/${attempt.id}/submit`).set(auth(A.token)).expect(200);
      const r2 = await http.post(`${api}/attempts/${attempt.id}/submit`).set(auth(A.token)).expect(200);
      expect(r2.body.score).toBe(r1.body.score);
      expect(r1.body.questions[0]).toHaveProperty('isCorrect');
      const notebook = await http.get(`${api}/error-notebook`).set(auth(A.token)).expect(200);
      expect(notebook.body.meta.total).toBeGreaterThanOrEqual(1);
      // Yakunlangan urinishga javob yozib bo'lmaydi
      await http
        .put(`${api}/attempts/${attempt.id}/answers/${attempt.questions[0].questionVersionId}`)
        .set(auth(A.token))
        .send({ response: { optionId: 'x' } })
        .expect(409);
    });
  });

  it('tenant isolation: boshqa tashkilotni boshqarib bo\'lmaydi', async () => {
    const orgA = (await http.post(`${api}/organizations`).set(auth(A.token)).send({ name: 'Markaz A' }).expect(201)).body;
    const orgB = (await http.post(`${api}/organizations`).set(auth(B.token)).send({ name: 'Markaz B' }).expect(201)).body;
    await http.post(`${api}/organizations/${orgA.id}/branches`).set(auth(A.token)).send({ name: 'Filial 1' }).expect(201);
    await http.post(`${api}/organizations/${orgB.id}/branches`).set(auth(A.token)).send({ name: 'Hack' }).expect(403);
    await http.get(`${api}/organizations/${orgB.id}`).set(auth(A.token)).expect(403);
    await http.get(`${api}/organizations/${orgB.id}/members`).set(auth(A.token)).expect(403);
    // x-organization-id header orqali boshqa tashkilot ruxsatini "qarzga olish" ishlamaydi
    await http.post(`${api}/organizations/${orgB.id}/groups`).set(auth(A.token)).set('x-organization-id', orgA.id).send({ name: 'g' }).expect(403);
  });

  it('ota-ona farzand ma\'lumotini faqat tasdiqlangandan keyin ko\'radi', async () => {
    await http.post(`${api}/parents/children`).set(auth(B.token)).send({ phone: A.phone }).expect(201);
    await http.get(`${api}/students/${A.id}/knowledge-map`).query({ subjectId: mathId }).set(auth(B.token)).expect(403);
    const pending = await http.get(`${api}/students/me/parent-requests`).set(auth(A.token)).expect(200);
    await http.post(`${api}/students/me/parent-requests/${pending.body[0].id}/approve`).set(auth(A.token)).expect(201);
    await http.get(`${api}/students/${A.id}/knowledge-map`).query({ subjectId: mathId }).set(auth(B.token)).expect(200);
  });

  it('muallif o\'z savolini tasdiqlay olmaydi', async () => {
    const topics = (await http.get(`${api}/subjects/${mathId}/topics`).expect(200)).body;
    const q = await http
      .post(`${api}/questions`)
      .set(auth(admin.token))
      .send({
        subjectId: mathId, topicId: topics[0].id, type: 'SINGLE_CHOICE', stem: '1+1=?',
        options: [{ label: 'A', content: '2', isCorrect: true }, { label: 'B', content: '3' }],
      })
      .expect(201);
    const sub = await http.post(`${api}/questions/${q.body.id}/submit-review`).set(auth(admin.token)).expect(201);
    await http.post(`${api}/questions/${q.body.id}/review`).set(auth(admin.token)).send({ versionId: sub.body.versionId, decision: 'APPROVE' }).expect(403);
  });

  it('savol shakli tekshiriladi (2 ta to\'g\'ri javobli single choice rad etiladi)', async () => {
    const topics = (await http.get(`${api}/subjects/${mathId}/topics`).expect(200)).body;
    await http
      .post(`${api}/questions`)
      .set(auth(admin.token))
      .send({
        subjectId: mathId, topicId: topics[0].id, type: 'SINGLE_CHOICE', stem: 'x',
        options: [{ label: 'A', content: '1', isCorrect: true }, { label: 'B', content: '2', isCorrect: true }],
      })
      .expect(400);
  });

  it('refresh token qayta ishlatilsa sessiya bekor qilinadi', async () => {
    const first = A.refresh;
    const r = await http.post(`${api}/auth/refresh`).send({ refreshToken: first }).expect(200);
    await http.post(`${api}/auth/refresh`).send({ refreshToken: first }).expect(401); // o'g'irlangan token
    await http.post(`${api}/auth/refresh`).send({ refreshToken: r.body.refreshToken }).expect(401); // sessiya yopildi
  });

  it('login brute-force: noto\'g\'ri parol 401', async () => {
    await http.post(`${api}/auth/login`).send({ login: B.phone, password: 'wrong-password' }).expect(401);
  });
});
