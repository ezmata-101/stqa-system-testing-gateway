import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from './proxy.service';

/**
 * Wildcard forwarding route (spec section 6): a single route handles every
 * HTTP method and every backend path under `/api/{offering-code}/...`.
 * No semester-specific routes are ever defined here — offering-specific
 * behaviour lives entirely in the control database and the backend itself.
 */
@Controller()
export class ProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @All('api/*splat')
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy.forward(req, res);
  }
}
