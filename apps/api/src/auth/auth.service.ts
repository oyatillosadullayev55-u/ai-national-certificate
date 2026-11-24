import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OtpPurpose } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { AuditService } from '../common/audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoginDto, RegisterDto, ResetPasswordDto, SendOtpDto, VerifyOtpDto } from './dto';
import { SmsProvider } from './sms.provider';

interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sms: SmsProvider,
    private readonly audit: AuditService,
  ) {}

  // ───────────── OTP ─────────────

  async sendOtp(dto: SendOtpDto) {
    const purpose = dto.purpose as OtpPurpose;
    const windowSec = this.config.get<number>('otp.windowSec')!;
    const recent = await this.prisma.otpCode.count({
      where: { phone: dto.phone, purpose, createdAt: { gt: new Date(Date.now() - windowSec * 1000) } },
    });
    if (recent >= this.config.get<number>('otp.maxPerWindow')!) {
      throw new HttpException('Juda ko\'p urinish. Birozdan keyin qayta urinib ko\'ring', HttpStatus.TOO_MANY_REQUESTS);
    }

    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (purpose === 'REGISTER' && existing) throw new ConflictException('Bu raqam allaqachon ro\'yxatdan o\'tgan');
    // Foydalanuvchi mavjudligini oshkor qilmaslik uchun reset/login holatida javob bir xil bo'ladi
    const shouldSend = purpose === 'REGISTER' || !!existing;

    const ttlSec = this.config.get<number>('otp.ttlSec')!;
    let devCode: string | undefined;
    if (shouldSend) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await this.prisma.otpCode.create({
        data: { phone: dto.phone, purpose, codeHash: this.hashOtp(dto.phone, code), expiresAt: new Date(Date.now() + ttlSec * 1000) },
      });
      await this.sms.send(dto.phone, `AI National Certificate tasdiqlash kodi: ${code}`);
      if (this.config.get<boolean>('otp.devEcho')) devCode = code;
    }
    return { sent: true, expiresInSec: ttlSec, ...(devCode ? { devCode } : {}) };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const purpose = dto.purpose as OtpPurpose;
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone: dto.phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new BadRequestException('Kod topilmadi yoki muddati tugagan');
    if (otp.attempts >= this.config.get<number>('otp.maxAttempts')!) {
      throw new HttpException('Urinishlar soni tugadi. Yangi kod so\'rang', HttpStatus.TOO_MANY_REQUESTS);
    }

    const ok = safeEqual(otp.codeHash, this.hashOtp(dto.phone, dto.code));
    if (!ok) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('Kod noto\'g\'ri');
    }
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    const verificationToken = await this.jwt.signAsync(
      { phone: dto.phone, purpose, typ: 'verification' },
      { secret: this.config.get('jwt.verificationSecret'), expiresIn: '10m' },
    );
    return { verificationToken };
  }

  // ───────────── Register / Login ─────────────

  async register(dto: RegisterDto, client: ClientInfo) {
    const { phone } = await this.readVerification(dto.verificationToken, 'REGISTER');
    if (await this.prisma.user.findUnique({ where: { phone } })) throw new ConflictException('Foydalanuvchi mavjud');

    const roleKey = dto.accountType ?? 'student';
    const role = await this.prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) throw new Error(`Rol topilmadi: ${roleKey}. Seed'ni ishga tushiring`);

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          phone,
          passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
          locale: dto.locale ?? 'uz_latn',
          profile: { create: { firstName: dto.firstName, lastName: dto.lastName } },
          ...(roleKey === 'student' ? { studentProfile: { create: {} } } : {}),
        },
      });
      await tx.userRole.create({ data: { userId: u.id, roleId: role.id } });
      // Repetitor uchun shaxsiy tashkilot: guruh va testlar uchun tenant
      if (roleKey === 'teacher') {
        const teacherRole = await tx.role.findUniqueOrThrow({ where: { key: 'teacher' } });
        const org = await tx.organization.create({
          data: { name: `${dto.firstName} — shaxsiy`, type: 'PERSONAL', ownerId: u.id, members: { create: { userId: u.id } } },
        });
        await tx.userRole.create({ data: { userId: u.id, roleId: teacherRole.id, organizationId: org.id } });
      }
      return u;
    });

    await this.audit.log({ actorId: user.id, action: 'auth.register', entityType: 'user', entityId: user.id, ip: client.ip });
    return this.issueTokens(user.id, client);
  }

  async login(dto: LoginDto, client: ClientInfo) {
    const where = dto.login.includes('@') ? { email: dto.login.toLowerCase() } : { phone: dto.login };
    const user = await this.prisma.user.findUnique({ where });
    // Foydalanuvchi topilmasa ham hash tekshiruvi vaqtini taqlid qilamiz
    const valid = user?.passwordHash
      ? await argon2.verify(user.passwordHash, dto.password)
      : (await argon2.hash('timing-equalizer'), false);
    if (!user || !valid) throw new UnauthorizedException('Login yoki parol noto\'g\'ri');
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Hisob bloklangan');
    return this.issueTokens(user.id, client);
  }

  async resetPassword(dto: ResetPasswordDto) {
    const { phone } = await this.readVerification(dto.verificationToken, 'RESET_PASSWORD');
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await argon2.hash(dto.newPassword, { type: argon2.argon2id }) },
      }),
      // Parol o'zgarganda barcha sessiyalar bekor qilinadi
      this.prisma.userSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorId: user.id, action: 'auth.password_reset', entityType: 'user', entityId: user.id });
    return { ok: true };
  }

  // ───────────── Tokens ─────────────

  /** Refresh token formati: `<sessionId>.<secret>`; DB'da faqat secret'ning sha256 hash'i saqlanadi */
  async refresh(refreshToken: string, client: ClientInfo) {
    const [sessionId, secret] = refreshToken.split('.');
    if (!sessionId || !secret) throw new UnauthorizedException('Refresh token yaroqsiz');
    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } }).catch(() => null);
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Sessiya tugagan');
    }
    if (!safeEqual(session.refreshTokenHash, sha256(secret))) {
      // Eski (allaqachon almashtirilgan) token qayta ishlatildi → o'g'irlangan bo'lishi mumkin
      await this.prisma.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      await this.audit.log({ actorId: session.userId, action: 'auth.refresh_reuse_detected', entityType: 'session', entityId: session.id, ip: client.ip });
      throw new UnauthorizedException('Sessiya bekor qilindi');
    }

    const newSecret = randomBytes(48).toString('base64url');
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: sha256(newSecret), lastUsedAt: new Date(), ip: client.ip, userAgent: client.userAgent },
    });
    return {
      accessToken: await this.signAccess(session.userId, session.id),
      refreshToken: `${session.id}.${newSecret}`,
      expiresIn: this.config.get<number>('jwt.accessTtlSec'),
    };
  }

  async logout(sessionId: string) {
    await this.prisma.userSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  async logoutAll(userId: string) {
    const r = await this.prisma.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true, revoked: r.count };
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, ip: true, createdAt: true, lastUsedAt: true },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((s) => ({ ...s, current: s.id === currentSessionId }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const r = await this.prisma.userSession.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (r.count === 0) throw new NotFoundException('Sessiya topilmadi');
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, phone: true, email: true, locale: true, status: true, createdAt: true,
        profile: true, studentProfile: true,
        roles: { select: { organizationId: true, branchId: true, role: { select: { key: true, name: true } } } },
      },
    });
    return user;
  }

  private async issueTokens(userId: string, client: ClientInfo) {
    const secret = randomBytes(48).toString('base64url');
    const days = this.config.get<number>('jwt.refreshTtlDays')!;
    const session = await this.prisma.userSession.create({
      data: {
        userId,
        refreshTokenHash: sha256(secret),
        ip: client.ip,
        userAgent: client.userAgent?.slice(0, 255),
        expiresAt: new Date(Date.now() + days * 86_400_000),
      },
    });
    return {
      accessToken: await this.signAccess(userId, session.id),
      refreshToken: `${session.id}.${secret}`,
      expiresIn: this.config.get<number>('jwt.accessTtlSec'),
    };
  }

  private signAccess(userId: string, sessionId: string) {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId, typ: 'access' },
      { secret: this.config.get('jwt.accessSecret'), expiresIn: this.config.get<number>('jwt.accessTtlSec') },
    );
  }

  private async readVerification(token: string, purpose: OtpPurpose) {
    try {
      const p = await this.jwt.verifyAsync<{ phone: string; purpose: OtpPurpose; typ: string }>(token, {
        secret: this.config.get('jwt.verificationSecret'),
      });
      if (p.typ !== 'verification' || p.purpose !== purpose) throw new Error();
      return p;
    } catch {
      throw new UnauthorizedException('Tasdiqlash tokeni yaroqsiz');
    }
  }

  private hashOtp(phone: string, code: string) {
    return createHmac('sha256', this.config.get<string>('otp.secret')!).update(`${phone}:${code}`).digest('hex');
  }
}

function sha256(v: string) {
  return createHash('sha256').update(v).digest('hex');
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
