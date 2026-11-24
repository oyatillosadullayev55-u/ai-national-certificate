import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { PrismaService } from './common/prisma/prisma.service';

/** DI grafi va route'lar to'g'ri yig'ilishini DB'siz tekshiradi */
describe('AppModule', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: async () => undefined, onModuleDestroy: async () => undefined })
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0, '127.0.0.1');
  });

  afterAll(() => app?.close());

  it('ishga tushadi va asosiy route\'larni ro\'yxatdan o\'tkazadi', () => {
    const router = app.getHttpAdapter().getInstance()._router;
    const paths: string[] = router.stack.filter((l: any) => l.route).map((l: any) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
    expect(paths).toEqual(
      expect.arrayContaining([
        'POST /api/v1/auth/send-otp',
        'POST /api/v1/tests/:id/start',
        'PUT /api/v1/attempts/:attemptId/answers/:questionVersionId',
        'POST /api/v1/attempts/:attemptId/submit',
        'GET /api/v1/students/me/knowledge-map',
        'POST /api/v1/ai/tutor/conversations/:id/messages',
        'GET /api/v1/admin/dashboard',
        'GET /api/v1/metrics',
      ]),
    );
  });

  it('himoyalangan endpoint token talab qiladi', async () => {
    const res = await fetch(`${await app.getUrl()}/api/v1/auth/me`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });
});
