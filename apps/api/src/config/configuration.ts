export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    accessTtlSec: parseInt(process.env.JWT_ACCESS_TTL_SEC ?? '900', 10), // 15 daqiqa
    refreshTtlDays: parseInt(process.env.JWT_REFRESH_TTL_DAYS ?? '30', 10),
    verificationSecret: required('JWT_VERIFICATION_SECRET'),
  },
  otp: {
    secret: required('OTP_SECRET'),
    ttlSec: parseInt(process.env.OTP_TTL_SEC ?? '120', 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? '5', 10),
    maxPerWindow: parseInt(process.env.OTP_MAX_PER_WINDOW ?? '3', 10),
    windowSec: parseInt(process.env.OTP_WINDOW_SEC ?? '600', 10),
    // Faqat development/test: OTP kodni javobda qaytaradi (production'da hech qachon ishlamaydi)
    devEcho: process.env.NODE_ENV !== 'production' && process.env.OTP_DEV_ECHO === 'true',
  },
  sms: smsConfig(),
  exam: {
    // Internet uzilishi uchun deadline'dan keyin qabul qilinadigan qo'shimcha vaqt
    graceSec: parseInt(process.env.EXAM_GRACE_SEC ?? '30', 10),
  },
  ai: {
    engineUrl: process.env.AI_ENGINE_URL ?? 'http://localhost:8000',
    internalKey: required('AI_INTERNAL_KEY'),
    dailyMessageLimitFree: parseInt(process.env.AI_DAILY_LIMIT_FREE ?? '20', 10),
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS ?? '60000', 10),
  },
});

/** Noto'g'ri SMS sozlamasi bilan API ishga tushmaydi — aks holda o'quvchilar OTP kodsiz qoladi */
function smsConfig() {
  const provider = process.env.SMS_PROVIDER?.trim() || 'console';
  if (provider !== 'console' && provider !== 'eskiz') {
    throw new Error(`SMS_PROVIDER must be "console" or "eskiz", got "${provider}"`);
  }
  if (provider === 'console' && process.env.NODE_ENV === 'production') {
    throw new Error('SMS_PROVIDER=eskiz is required in production: the console provider does not send SMS');
  }
  const eskiz = {
    email: process.env.ESKIZ_EMAIL?.trim() ?? '',
    password: process.env.ESKIZ_PASSWORD ?? '',
    from: process.env.ESKIZ_FROM?.trim() || '4546',
    timeoutMs: Number(process.env.ESKIZ_TIMEOUT_MS || '10000'),
  };
  if (provider === 'eskiz') {
    const missing = [!eskiz.email && 'ESKIZ_EMAIL', !eskiz.password.trim() && 'ESKIZ_PASSWORD'].filter(Boolean);
    if (missing.length) throw new Error(`SMS_PROVIDER=eskiz requires ${missing.join(', ')}`);
    if (!Number.isInteger(eskiz.timeoutMs) || eskiz.timeoutMs <= 0) {
      throw new Error('ESKIZ_TIMEOUT_MS must be a positive integer (milliseconds)');
    }
  }
  return { provider, eskiz };
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Environment variable ${name} is required`);
    }
    return `dev-only-${name.toLowerCase()}`;
  }
  return v;
}
