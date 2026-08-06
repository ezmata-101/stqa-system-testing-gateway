import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const PUBLIC_PATHS = new Set(['/admin/login']);

type AdminSession = Request['session'] & {
  isAdmin?: boolean;
};

/**
 * Protects the instructor dashboard with a shared-secret login + session
 * cookie (spec section 24). Kept intentionally simple for a first cut;
 * upgrade to per-instructor accounts if multiple graders need distinct
 * audit trails.
 */
@Injectable()
export class AdminAuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const session = req.session as AdminSession | undefined;
    if (PUBLIC_PATHS.has(req.path) || req.path.startsWith('/admin/public')) {
      return next();
    }
    if (session?.isAdmin) {
      return next();
    }
    if (req.path.startsWith('/admin/api/')) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Admin login required.' } });
      return;
    }
    res.redirect('/admin/login');
  }
}
