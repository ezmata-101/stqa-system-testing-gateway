import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AdminDashboardService } from './admin-dashboard.service';

@Controller('admin')
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get()
  async home(@Res() res: Response) {
    const offerings = await this.dashboard.listOfferingsOverview();
    res.render('offerings-list', { offerings });
  }

  @Get('offerings/:id')
  async offeringDetail(@Param('id') id: string, @Res() res: Response) {
    const detail = await this.dashboard.offeringDetail(id);
    if (!detail) return res.status(404).render('not-found', { message: 'Offering not found' });
    const [teamActivity, studentActivity] = await Promise.all([
      this.dashboard.teamActivity(id),
      this.dashboard.studentActivity(id),
    ]);
    res.render('offering-detail', { ...detail, teamActivity, studentActivity });
  }

  @Get('offerings/:id/export')
  async exportCsv(@Param('id') id: string, @Res() res: Response) {
    const csv = await this.dashboard.exportActivityReportCsv(id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="offering-${id}-activity.csv"`);
    res.send(csv);
  }

  @Get('requests/lookup')
  async lookupPage(@Res() res: Response) {
    res.render('request-lookup', { result: null, requestId: null });
  }

  @Get('requests/:requestId')
  async lookupResult(@Param('requestId') requestId: string, @Res() res: Response) {
    const result = await this.dashboard.requestLookup(requestId);
    res.render('request-lookup', { result, requestId });
  }
}
