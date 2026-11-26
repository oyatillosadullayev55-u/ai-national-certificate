import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { EskizSmsProvider } from './eskiz-sms.provider';

const PHONE = '+998901234567';
const CODE = '482913';
const TEXT = `AI National Certificate tasdiqlash kodi: ${CODE}`;
const PASSWORD = 'test-api-password';
const DAY = 86_400_000;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const tokenOk = (token: string) => json({ message: 'token_generated', data: { token }, token_type: 'bearer' });
const sent = () => json({ id: '59bf10a2-aba8-4694-8fd5-0be20102a580', message: 'Waiting for SMS provider', status: 'waiting' });

/** Haqiqiy tarmoqqa chiqilmaydi: fetch to'liq almashtirilgan */
describe('EskizSmsProvider', () => {
  let fetchMock: jest.SpyInstance;
  let logs: string[];
  let now: number;
  let provider: EskizSmsProvider;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      throw new Error(`Kutilmagan so'rov: ${url}`);
    });
    logs = [];
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => void logs.push(args.join(' ')));
    }
    now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    provider = new EskizSmsProvider({ email: 'sms@example.com', password: PASSWORD, from: '4546', timeoutMs: 1000 });
  });

  afterEach(() => jest.restoreAllMocks());

  const reply = (...responses: Response[]) => responses.forEach((r) => fetchMock.mockResolvedValueOnce(r));
  const calls = () =>
    fetchMock.mock.calls.map(([url, init]: [string, RequestInit]) => ({
      route: `${init.method} ${url.replace('https://notify.eskiz.uz/api', '')}`,
      auth: (init.headers as Record<string, string> | undefined)?.authorization,
      fields: init.body ? Object.fromEntries(init.body as FormData) : undefined,
    }));
  const routes = () => calls().map((c) => c.route);
  const expectNoSecrets = () => {
    const all = logs.join('\n');
    for (const secret of [CODE, PHONE, PHONE.slice(1), PASSWORD, 'token-']) expect(all).not.toContain(secret);
  };

  it('login qilib, SMS\'ni hujjatdagi formatda yuboradi', async () => {
    reply(tokenOk('token-1'), sent());
    await provider.send(PHONE, TEXT);

    expect(calls()).toEqual([
      { route: 'POST /auth/login', auth: undefined, fields: { email: 'sms@example.com', password: PASSWORD } },
      { route: 'POST /message/sms/send', auth: 'Bearer token-1', fields: { mobile_phone: '998901234567', message: TEXT, from: '4546' } },
    ]);
    expect(logs.join('\n')).toContain('+99890***67');
    expectNoSecrets();
  });

  it('tokenni keshlaydi', async () => {
    reply(tokenOk('token-1'), sent(), sent());
    await provider.send(PHONE, TEXT);
    now += 27 * DAY;
    await provider.send(PHONE, TEXT);

    expect(routes()).toEqual(['POST /auth/login', 'POST /message/sms/send', 'POST /message/sms/send']);
  });

  it('parallel yuborishlarda bir marta login qiladi', async () => {
    reply(tokenOk('token-1'), sent(), sent(), sent());
    await Promise.all([1, 2, 3].map(() => provider.send(PHONE, TEXT)));

    expect(routes().filter((r) => r === 'POST /auth/login')).toHaveLength(1);
  });

  it('muddati yaqinlashgan tokenni PATCH /auth/refresh bilan yangilaydi', async () => {
    reply(tokenOk('token-1'), sent(), tokenOk('token-2'), sent());
    await provider.send(PHONE, TEXT);
    now += 28 * DAY;
    await provider.send(PHONE, TEXT);

    expect(calls().slice(2)).toEqual([
      { route: 'PATCH /auth/refresh', auth: 'Bearer token-1', fields: undefined },
      expect.objectContaining({ route: 'POST /message/sms/send', auth: 'Bearer token-2' }),
    ]);
  });

  it('refresh ishlamasa, qayta login qiladi', async () => {
    reply(tokenOk('token-1'), sent(), json({ message: 'Expired' }, 401), tokenOk('token-2'), sent());
    await provider.send(PHONE, TEXT);
    now += 31 * DAY;
    await provider.send(PHONE, TEXT);

    expect(routes().slice(2)).toEqual(['PATCH /auth/refresh', 'POST /auth/login', 'POST /message/sms/send']);
    expect(calls()[4].auth).toBe('Bearer token-2');
    expectNoSecrets();
  });

  it('401 da qayta login qilib, yuborishni bir marta takrorlaydi', async () => {
    reply(tokenOk('token-1'), json({}, 401), tokenOk('token-2'), sent());
    await provider.send(PHONE, TEXT);

    expect(routes()).toEqual(['POST /auth/login', 'POST /message/sms/send', 'POST /auth/login', 'POST /message/sms/send']);
    expect(calls()[3].auth).toBe('Bearer token-2');
  });

  it('bir vaqtda kelgan 401 lar bitta qayta login qiladi', async () => {
    let logins = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/login')) return tokenOk(`token-${++logins}`);
      const auth = (init.headers as Record<string, string>).authorization;
      return auth === 'Bearer token-1' ? json({}, 401) : sent();
    });
    await Promise.all([provider.send(PHONE, TEXT), provider.send(PHONE, TEXT)]);

    expect(logins).toBe(2);
  });

  it('takroriy 401 da cheksiz urinmaydi', async () => {
    reply(tokenOk('token-1'), json({}, 401), tokenOk('token-2'), json({}, 401));
    await expect(provider.send(PHONE, TEXT)).rejects.toThrow(ServiceUnavailableException);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expectNoSecrets();
  });

  it('Eskiz xatosini logga yozadi, javobdagi kod va raqamni yashiradi', async () => {
    reply(tokenOk('token-1'), json({ message: `Matn tasdiqlanmagan: "${TEXT}" → ${PHONE}` }, 400));
    await expect(provider.send(PHONE, TEXT)).rejects.toThrow(ServiceUnavailableException);

    expect(logs.join('\n')).toContain('HTTP 400: Matn tasdiqlanmagan');
    expectNoSecrets();
  });

  it('matn bo\'lmagan xato xabarini ham tozalaydi', async () => {
    reply(tokenOk('token-1'), json({ message: { mobile_phone: [`${PHONE.slice(1)} noto'g'ri`] } }, 422));
    await expect(provider.send(PHONE, TEXT)).rejects.toThrow(ServiceUnavailableException);

    expect(logs.join('\n')).toContain('mobile_phone');
    expectNoSecrets();
  });

  it.each([
    ['5xx HTML sahifa', () => new Response(`<html>${CODE}</html>`, { status: 502 })],
    ['200, lekin JSON emas', () => new Response(`OK ${CODE}`, { status: 200 })],
    ['200, lekin id yo\'q', () => json({ status: 'error' })],
    ['200, JSON null', () => json(null)],
  ])('yaroqsiz javob xato hisoblanadi: %s', async (_name, response) => {
    reply(tokenOk('token-1'), response());
    await expect(provider.send(PHONE, TEXT)).rejects.toThrow(ServiceUnavailableException);
    expectNoSecrets();
  });

  it('login rad etilsa SMS yubormaydi, parolni logga yozmaydi va keyingi safar qayta urinadi', async () => {
    reply(json({ message: `Invalid credentials: ${PASSWORD}` }, 401));
    await expect(provider.send(PHONE, TEXT)).rejects.toThrow(ServiceUnavailableException);
    expect(routes()).toEqual(['POST /auth/login']);
    expectNoSecrets();

    reply(tokenOk('token-1'), sent());
    await expect(provider.send(PHONE, TEXT)).resolves.toBeUndefined();
  });

  it('login javobida token bo\'lmasa xato beradi', async () => {
    reply(json({ message: 'token_generated', data: {} }));
    await expect(provider.send(PHONE, TEXT)).rejects.toThrow(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('javob kelmasa so\'rovni timeout bilan to\'xtatadi', async () => {
    provider = new EskizSmsProvider({ email: 'sms@example.com', password: PASSWORD, from: '4546', timeoutMs: 20 });
    let keepAlive: NodeJS.Timeout | undefined;
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          keepAlive = setTimeout(() => reject(new Error('signal ishlamadi')), 2000);
          init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    await expect(provider.send(PHONE, TEXT)).rejects.toThrow(ServiceUnavailableException);
    clearTimeout(keepAlive);

    expect(logs.join('\n')).toContain('20 ms ichida javob kelmadi');
  });

  it('tarmoq xatosini ushlaydi', async () => {
    fetchMock.mockRejectedValue(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));
    await expect(provider.send(PHONE, TEXT)).rejects.toThrow(ServiceUnavailableException);

    expect(logs.join('\n')).toContain('ECONNREFUSED');
    expectNoSecrets();
  });
});
