import {
  Controller,
  Post,
  Body,
  Param,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { OfferingsService } from '../offerings/offerings.service';
import { CredentialsService } from '../credentials/credentials.service';
import { ProvisioningService } from '../provisioning/provisioning.service';
import { ResetService } from '../reset/reset.service';
import { TeamsService } from '../teams/teams.service';
import { parseRosterCsv } from '../provisioning/roster-parser';

/**
 * Administrative actions from spec section 24: create/close offering,
 * import roster, generate/revoke credentials, provision databases, reset a
 * team database, all triggered from the dashboard.
 */
@Controller('admin/offerings')
export class AdminActionsController {
  constructor(
    private readonly offerings: OfferingsService,
    private readonly credentials: CredentialsService,
    private readonly provisioning: ProvisioningService,
    private readonly reset: ResetService,
    private readonly teams: TeamsService,
  ) {}

  @Post()
  async create(
    @Body('semesterId') semesterId: string,
    @Body('backendVersionId') backendVersionId: string,
    @Body('code') code: string,
    @Body('activeFrom') activeFrom: string,
    @Body('activeUntil') activeUntil: string,
    @Body('maximumTeamSize') maximumTeamSize: string,
    @Body('resetLimitPerDay') resetLimitPerDay: string,
    @Res() res: Response,
  ) {
    const offering = await this.offerings.create({
      semesterId,
      backendVersionId,
      code,
      activeFrom: new Date(activeFrom),
      activeUntil: new Date(activeUntil),
      maximumTeamSize: parseInt(maximumTeamSize, 10) || 4,
      resetLimitPerDay: parseInt(resetLimitPerDay, 10) || 3,
      configuration: {},
    });
    res.redirect(`/admin/offerings/${offering.id}`);
  }

  @Post(':id/activate')
  async activate(@Param('id') id: string, @Res() res: Response) {
    await this.offerings.setStatus(id, 'active');
    res.redirect(`/admin/offerings/${id}`);
  }

  @Post(':id/close')
  async close(@Param('id') id: string, @Res() res: Response) {
    await this.offerings.setStatus(id, 'closed');
    res.redirect(`/admin/offerings/${id}`);
  }

  @Post(':id/roster')
  @UseInterceptors(FileInterceptor('roster'))
  async importRoster(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ) {
    const offering = await this.offerings.findById(id);
    if (!offering) return res.status(404).render('not-found', { message: 'Offering not found' });

    const tmpPath = join(tmpdir(), `roster-${Date.now()}.csv`);
    writeFileSync(tmpPath, file.buffer);
    try {
      const roster = parseRosterCsv(tmpPath);
      const result = await this.provisioning.provision(offering.code, roster);
      res.render('roster-result', { offering, result });
    } finally {
      unlinkSync(tmpPath);
    }
  }

  @Post(':id/credentials/:studentId/revoke')
  async revokeCredential(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Res() res: Response,
  ) {
    await this.credentials.revoke(id, studentId);
    res.redirect(`/admin/offerings/${id}`);
  }

  @Post(':id/teams/:teamId/reset')
  async resetTeam(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Res() res: Response,
  ) {
    await this.reset.resetTeamDatabase({
      offeringId: id,
      teamId,
      requestedBy: 'admin:dashboard',
    });
    res.redirect(`/admin/offerings/${id}`);
  }
}
