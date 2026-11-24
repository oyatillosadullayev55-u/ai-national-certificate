import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccessService } from './access/access.service';
import { IS_PUBLIC, PERMISSIONS, PermissionMeta } from './decorators';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Token topilmadi');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; sid: string; typ: string }>(header.slice(7), {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      if (payload.typ !== 'access') throw new Error('wrong token type');
      req.user = { id: payload.sub, sessionId: payload.sid };
      return true;
    } catch {
      throw new UnauthorizedException('Token yaroqsiz yoki muddati tugagan');
    }
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<PermissionMeta>(PERMISSIONS, [ctx.getHandler(), ctx.getClass()]);
    if (!meta || meta.permissions.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    if (!req.user) throw new UnauthorizedException();

    const orgId = resolveOrgId(req, meta.options.orgFrom);
    const { isSuperAdmin, permissions } = await this.access.getPermissions(req.user.id, orgId);
    if (isSuperAdmin) return true;
    const ok = meta.permissions.every((p) => permissions.has(p));
    if (!ok) throw new ForbiddenException('Ruxsat yetarli emas');
    req.organizationId = orgId;
    return true;
  }
}

function resolveOrgId(req: any, orgFrom?: string): string | null {
  if (orgFrom) {
    const [source, key] = orgFrom.split('.');
    return req[source]?.[key] ?? null;
  }
  const h = req.headers['x-organization-id'];
  return typeof h === 'string' && h.length > 0 ? h : null;
}
