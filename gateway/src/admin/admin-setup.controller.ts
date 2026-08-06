import { Controller, Get, Post, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ControlDbService } from '../db/control-db.service';

/**
 * Minimal management for the two prerequisite entities an offering
 * references (semesters, backend_versions). Not explicitly listed among
 * spec section 24's admin actions, but required before "Create offering"
 * can be used meaningfully.
 */
@Controller('admin/setup')
export class AdminSetupController {
  constructor(private readonly db: ControlDbService) {}

  @Get()
  async page(@Res() res: Response) {
    const [semesters, backendVersions] = await Promise.all([
      this.db.query('SELECT id, name, starts_at, ends_at FROM semesters ORDER BY starts_at DESC'),
      this.db.query(
        'SELECT id, name, version, backend_url, database_template, status FROM backend_versions ORDER BY created_at DESC',
      ),
    ]);
    res.render('setup', { semesters: semesters.rows, backendVersions: backendVersions.rows });
  }

  @Post('semesters')
  async createSemester(
    @Body('name') name: string,
    @Body('startsAt') startsAt: string,
    @Body('endsAt') endsAt: string,
    @Res() res: Response,
  ) {
    await this.db.query(
      'INSERT INTO semesters (name, starts_at, ends_at) VALUES ($1,$2,$3)',
      [name, startsAt, endsAt],
    );
    res.redirect('/admin/setup');
  }

  @Post('backend-versions')
  async createBackendVersion(
    @Body('name') name: string,
    @Body('version') version: string,
    @Body('backendUrl') backendUrl: string,
    @Body('healthcheckPath') healthcheckPath: string,
    @Body('databaseTemplate') databaseTemplate: string,
    @Res() res: Response,
  ) {
    await this.db.query(
      `INSERT INTO backend_versions (name, version, backend_url, healthcheck_path, database_template, status)
       VALUES ($1,$2,$3,$4,$5,'active')`,
      [name, version, backendUrl, healthcheckPath || '/_internal/health', databaseTemplate],
    );
    res.redirect('/admin/setup');
  }
}
