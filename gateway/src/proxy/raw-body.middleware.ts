import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { GatewayError, GatewayErrorCode } from '../common/errors/gateway-error';
import { ConfigService } from '../common/config/config.service';

/**
 * Captures the raw request body as a Buffer (without JSON-parsing it) so the
 * proxy can forward byte-for-byte to the backend regardless of content
 * type, while logging/redaction still gets to inspect it separately.
 * Enforces the configurable max body size (spec section 23).
 */
@Injectable()
export class RawBodyMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const chunks: Buffer[] = [];
    let total = 0;
    let rejected = false;
    const maxBytes = this.config.defaultMaxBodySize;

    req.on('data', (chunk: Buffer) => {
      if (rejected) return;
      total += chunk.length;
      if (total > maxBytes) {
        rejected = true;
        next(
          new GatewayError(
            413,
            GatewayErrorCode.REQUEST_TOO_LARGE,
            `Request body exceeds the maximum allowed size of ${maxBytes} bytes.`,
          ),
        );
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      (req as any).rawBody = Buffer.concat(chunks);
      next();
    });
    req.on('error', (err) => {
      if (!rejected) next(err);
    });
  }
}
