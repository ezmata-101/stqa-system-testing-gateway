import { Controller, Get, Post, Body, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '../common/config/config.service';

type AdminSession = Request['session'] & {
  isAdmin?: boolean;
  adminUser?: string;
};

@Controller('admin')
export class AdminAuthController {
  constructor(private readonly config: ConfigService) {}

  @Get('login')
  loginPage(@Res() res: Response, @Req() req: Request) {
    const session = req.session as AdminSession | undefined;
    if (session?.isAdmin) return res.redirect('/admin');
    res.render('login', { error: null });
  }

  @Post('login')
  login(@Body('secret') secret: string, @Req() req: Request, @Res() res: Response) {
    const session = req.session as AdminSession | undefined;
    if (secret && secret === this.config.adminAuthSecret && session) {
      session.isAdmin = true;
      session.adminUser = 'instructor';
      return res.redirect('/admin');
    }
    res.status(401).render('login', { error: 'Invalid admin secret.' });
  }

  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    req.session?.destroy(() => res.redirect('/admin/login'));
  }
}
