import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { randomUUID } from 'crypto';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    let requestId: string;
    try {
      requestId =
        req?.headers && req.headers['x-request-id']
          ? String(req.headers['x-request-id'])
          : randomUUID();
      req.requestId = requestId;
      if (res && typeof res.setHeader === 'function') {
        res.setHeader('x-request-id', requestId);
      }
    } catch {
      requestId = 'unknown';
    }

    const method = req?.method || 'UNKNOWN';
    const url = req?.originalUrl || req?.url || 'UNKNOWN';
    const userAgent = req?.headers ? req.headers['user-agent'] : undefined;
    const ip =
      req?.headers && req.headers['x-forwarded-for']
        ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
        : req?.ip;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        try {
          const durationMs = Date.now() - startTime;
          const statusCode = res?.statusCode || 200;
          const userId = req?.user?.id || req?.user?.sub || undefined;

          this.logger.log({
            message: `${method} ${url} ${statusCode} +${durationMs}ms`,
            requestId,
            method,
            url,
            statusCode,
            durationMs,
            userId,
            ip,
            userAgent,
          });
        } catch {
          // Fail-safe: logging error must never break the response
        }
      }),
      catchError((err) => {
        try {
          const durationMs = Date.now() - startTime;
          const statusCode =
            err?.status ||
            (typeof err?.getStatus === 'function' ? err.getStatus() : 500);
          const userId = req?.user?.id || req?.user?.sub || undefined;

          this.logger.error({
            message: `${method} ${url} ${statusCode} +${durationMs}ms [ERROR: ${err?.message || 'Unknown'}]`,
            requestId,
            method,
            url,
            statusCode,
            durationMs,
            userId,
            ip,
            userAgent,
          });
        } catch {
          // Fail-safe
        }
        return throwError(() => err);
      }),
    );
  }
}

