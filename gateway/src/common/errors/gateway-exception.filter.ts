import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { GatewayError, GatewayErrorCode } from './gateway-error';

/**
 * Renders every error (gateway-generated, Nest HttpException, or unexpected)
 * using the standard envelope from spec section 28, always including the
 * request ID so students can reference it in bug reports.
 */
@Catch()
export class GatewayExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId: string | undefined = (request as any).stqaRequestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = GatewayErrorCode.INTERNAL_ERROR;
    let message = 'An unexpected error occurred.';

    if (exception instanceof GatewayError) {
      status = exception.httpStatus;
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = status === 404 ? GatewayErrorCode.NOT_FOUND : GatewayErrorCode.VALIDATION_ERROR;
      message =
        typeof body === 'string'
          ? body
          : ((body as any)?.message ?? exception.message);
      if (Array.isArray(message)) message = message.join(', ');
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    response.status(status).json({
      error: { code, message },
      _lab: { requestId: requestId ?? null },
    });
  }
}
