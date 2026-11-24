import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

/** Har bir so'rovga Request ID */
export function requestIdMiddleware(req: Request & { id?: string }, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}

/** Standart xato javobi: { error: { code, message, details }, requestId } */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Ichki xatolik';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as any;
      code = HttpStatus[status] ?? 'ERROR';
      if (typeof body === 'string') message = body;
      else {
        message = Array.isArray(body.message) ? 'Validatsiya xatosi' : body.message ?? message;
        if (Array.isArray(body.message)) details = body.message;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'CONFLICT';
        message = 'Bunday yozuv allaqachon mavjud';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'Topilmadi';
      } else {
        this.logger.error(exception.message, exception.stack);
      }
    } else {
      // Shaxsiy ma'lumotlar logga tushmasligi uchun faqat xabar va stack
      const err = exception as Error;
      this.logger.error(`[${req.id}] ${err?.message}`, err?.stack);
    }

    res.status(status).json({ error: { code, message, details }, requestId: req.id });
  }
}

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export function pageArgs(q: PaginationQueryDto) {
  return { skip: (q.page - 1) * q.limit, take: q.limit };
}

export function paged<T>(items: T[], total: number, q: PaginationQueryDto) {
  return { items, meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) } };
}
