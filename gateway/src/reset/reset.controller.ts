import { Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ResetService } from './reset.service';
import { GatewayError, GatewayErrorCode } from '../common/errors/gateway-error';

/**
 * Internal reset endpoint (spec section 20). Protected by the same
 * `X-STQA-Key` lab-auth middleware as `/api/*`; the offering is resolved
 * from the credential itself since there's no offering-code path segment
 * here.
 */
@Controller('_lab')
export class ResetController {
  constructor(private readonly resetService: ResetService) {}

  @Post('reset')
  async reset(@Req() req: Request) {
    const context = req.stqaContext;
    if (!context) {
      throw new GatewayError(
        401,
        GatewayErrorCode.MISSING_LAB_CREDENTIAL,
        'A valid X-STQA-Key is required to request a reset.',
      );
    }
    const result = await this.resetService.resetTeamDatabase({
      offeringId: context.offering.id,
      teamId: context.teamId,
      requestedBy: context.studentId,
    });
    return {
      data: { status: 'succeeded', resetRequestId: result.resetRequestId },
      _lab: { requestId: context.requestId },
    };
  }
}
