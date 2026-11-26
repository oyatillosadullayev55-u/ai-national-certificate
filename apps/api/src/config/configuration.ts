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
