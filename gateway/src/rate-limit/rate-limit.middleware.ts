import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { RateLimitService } from './rate-limit.service';
import { LoggingDbService } from '../db/logging-db.service';
import { GatewayError, GatewayErrorCode } from '../common/errors/gateway-error';
import { ConfigService } from '../common/config/config.service';

/**
 * Applies per-student and per-team rate limits once `stqaContext` has been
 * resolved by LabAuthMiddleware. Limits come from the offering's
 * `configuration.rateLimit` (spec section 5/22), falling back to the
 * platform default. Violations are logged and returned as 429 with the
 * request ID (spec section 22).
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(
    private readonly rateLimit: RateLimitService,
    private readonly loggingDb: LoggingDbService,
    private readonly config: ConfigService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const context = req.stqaContext;
    if (!context) {
      // Auth middleware didn't run or didn't resolve a context; nothing to rate limit yet.
      return next();
    }

    const perStudentLimit =
      context.offering.configuration?.rateLimit?.perStudentPerMinute ?? this.config.defaultRateLimit;
    const perTeamLimit =
      context.offering.configuration?.rateLimit?.perTeamPerMinute ??
      this.config.defaultRateLimit * context.offering.maximumTeamSize;

    try {
      const [studentCheck, teamCheck] = await Promise.all([
        this.rateLimit.checkAndIncrement('student', context.studentId, perStudentLimit),
        this.rateLimit.checkAndIncrement('team', context.teamId, perTeamLimit),
      ]);

      const violated = [studentCheck, teamCheck].find((c) => !c.allowed);
      if (violated) {
        await this.loggingDb
          .logRateLimitEvent({
            requestId: context.requestId,
            offeringId: context.offering.code,
            teamId: context.teamId,
            studentId: context.studentId,
            scope: violated.scope,
            limitKey: violated.limitKey,
          })
          .catch(() => undefined);

        throw new GatewayError(
          429,
          GatewayErrorCode.RATE_LIMITED,
          `Rate limit exceeded (${violated.scope}). Try again shortly.`,
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  }
}
