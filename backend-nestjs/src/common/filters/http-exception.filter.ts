import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<any>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Server error';
    let code = 'INTERNAL_ERROR';

    const requestId =
      request?.requestId ||
      (request?.headers ? request.headers['x-request-id'] : undefined);
    const method = request?.method || 'UNKNOWN';
    const url = request?.originalUrl || request?.url || 'UNKNOWN';
    const userId = request?.user?.id || request?.user?.sub || undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = HttpStatus[status] || 'REQUEST_ERROR';
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : (res as any).message || exception.message;
      // If message is an array (validation errors), join them
      if (Array.isArray(message)) {
        message = message.join(', ');
      }

      try {
        if (status >= 500) {
          this.logger.error({
            message: `[${code}] ${message}`,
            requestId,
            method,
            url,
            status,
            userId,
            stack: exception.stack,
          });
        } else {
          this.logger.warn({
            message: `[${code}] ${message}`,
            requestId,
            method,
            url,
            status,
            userId,
          });
        }
      } catch {
        // Fail-safe: logging error must never break error response
      }
    } else {
      const errMessage =
        exception instanceof Error ? exception.message : String(exception);
      const stack = exception instanceof Error ? exception.stack : undefined;
      try {
        this.logger.error({
          message: `Unhandled Exception: ${errMessage}`,
          requestId,
          method,
          url,
          userId,
          stack,
        });
      } catch {
        // Fail-safe
      }
    }

    response.status(status).json({
      success: false,
      message,
      error: { code, message },
    });
  }
}

