import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export interface AuthUser {
  id: string;
  sessionId: string;
}

export const IS_PUBLIC = 'isPublic';
/** Autentifikatsiyasiz ochiq endpoint */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSIONS = 'permissions';
export interface PermissionOptions {
  /**
   * Tashkilot ID qayerdan olinadi. Masalan 'params.id' yoki 'params.organizationId'.
   * Ko'rsatilmasa — `x-organization-id` header'i, u ham bo'lmasa faqat global rollar tekshiriladi.
   */
  orgFrom?: string;
}
export interface PermissionMeta {
  permissions: string[];
  options: PermissionOptions;
}
/** Kerakli ruxsatlar (hammasi talab qilinadi) */
export const RequirePermissions = (permissions: string | string[], options: PermissionOptions = {}) =>
  SetMetadata<string, PermissionMeta>(PERMISSIONS, {
    permissions: Array.isArray(permissions) ? permissions : [permissions],
    options,
  });

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const RequestId = createParamDecorator((_: unknown, ctx: ExecutionContext): string | undefined => {
  return ctx.switchToHttp().getRequest().id;
});
