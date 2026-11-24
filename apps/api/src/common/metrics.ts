import { Controller, Get, Header, Headers, Module, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';
import { collectDefaultMetrics, Counter, Histogram, register } from 'prom-client';
import { Public } from './decorators';

collectDefaultMetrics({ prefix: 'anc_' });

const httpDuration = new Histogram({
  name: 'anc_http_request_duration_seconds',
  help: 'HTTP so\'rov davomiyligi',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const httpErrors = new Counter({
  name: 'anc_http_errors_total',
  help: '5xx javoblar soni',
  labelNames: ['method', 'route'],
});

/** Route shabloni bo'yicha (masalan /attempts/:attemptId) — label soni cheklangan bo'lsin */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = (req as any).route?.path ?? 'unmatched';
    end({ method: req.method, route, status: String(res.statusCode) });
    if (res.statusCode >= 500) httpErrors.inc({ method: req.method, route });
  });
  next();
}

@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  @Public()
  @Get()
  @Header('content-type', register.contentType)
  async metrics(@Headers('authorization') auth?: string) {
    const token = process.env.METRICS_TOKEN;
    if (token && auth !== `Bearer ${token}`) throw new UnauthorizedException();
    return register.metrics();
  }
}

@Module({ controllers: [MetricsController] })
export class MetricsModule {}
