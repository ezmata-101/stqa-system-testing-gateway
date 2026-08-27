import { Injectable } from '@nestjs/common';
import { ControlDbService } from '../db/control-db.service';
import { LoggingDbService } from '../db/logging-db.service';
import { OfferingsService } from '../offerings/offerings.service';
import { TeamsService } from '../teams/teams.service';
import { HealthService } from '../health/health.service';

/**
 * Read-side queries backing the instructor dashboard (spec section 24).
 * Joins static identity/mapping data from the control database with
 * aggregated activity from the logging database. Purely informational —
 * never used to make authorization decisions.
 */
@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly controlDb: ControlDbService,
    private readonly loggingDb: LoggingDbService,
    private readonly offerings: OfferingsService,
    private readonly teams: TeamsService,
    private readonly health: HealthService,
  ) {}

  async listOfferingsOverview() {
    const offerings = await this.offerings.listAll();
    const rows: {
      offering: (typeof offerings)[number];
      teamsCount: number;
      studentsCount: number;
      totalRequests: number;
      failedRequests: number;
      activeTeamsLast24h: number;
    }[] = [];
    for (const offering of offerings) {
      const [teamCountRes, studentCountRes, totalReqRes, failedReqRes, activeTeamsRes] =
        await Promise.all([
          this.controlDb.query('SELECT count(*)::int AS c FROM teams WHERE offering_id = $1', [
            offering.id,
          ]),
          this.controlDb.query(
            `SELECT count(DISTINCT tm.student_id)::int AS c
               FROM team_members tm JOIN teams t ON t.id = tm.team_id
              WHERE t.offering_id = $1`,
            [offering.id],
          ),
          this.loggingDb.query(
            'SELECT count(*)::int AS c FROM request_logs WHERE offering_id = $1',
            [offering.code],
          ),
          this.loggingDb.query(
            "SELECT count(*)::int AS c FROM request_logs WHERE offering_id = $1 AND status_code >= 400",
            [offering.code],
          ),
          this.loggingDb.query(
            `SELECT count(DISTINCT team_id)::int AS c FROM request_logs
              WHERE offering_id = $1 AND started_at > now() - interval '1 day'`,
            [offering.code],
          ),
        ]);

      rows.push({
        offering,
        teamsCount: teamCountRes.rows[0].c,
        studentsCount: studentCountRes.rows[0].c,
        totalRequests: totalReqRes.rows[0].c,
        failedRequests: failedReqRes.rows[0].c,
        activeTeamsLast24h: activeTeamsRes.rows[0].c,
      });
    }
    return rows;
  }

  async offeringDetail(offeringId: string) {
    const offering = await this.offerings.findById(offeringId);
    if (!offering) return null;
    const backendVersion = await this.offerings.getBackendVersion(offering.backendVersionId);
    const backendHealth = backendVersion ? await this.health.checkBackend(backendVersion) : null;
    return { offering, backendVersion, backendHealth };
  }

  async teamActivity(offeringId: string) {
    const offering = await this.offerings.findById(offeringId);
    if (!offering) return [];
    const teams = await this.teams.listByOffering(offeringId);

    const results: {
      team: (typeof teams)[number];
      members: string[];
      totalRequests: number;
      requestsByMethod: Record<string, number>;
      statusCodeDistribution: Record<string, number>;
      firstActivity: unknown;
      lastActivity: unknown;
      resetCount: number;
    }[] = [];
    for (const team of teams) {
      const members = await this.teams.membersOf(team.id);
      const [totals, byMethod, byStatus, firstLast, resetCount] = await Promise.all([
        this.loggingDb.query(
          'SELECT count(*)::int AS c FROM request_logs WHERE offering_id = $1 AND team_id = $2',
          [offering.code, team.teamCode],
        ),
        this.loggingDb.query(
          `SELECT method, count(*)::int AS c FROM request_logs
            WHERE offering_id = $1 AND team_id = $2 GROUP BY method`,
          [offering.code, team.teamCode],
        ),
        this.loggingDb.query(
          `SELECT status_code, count(*)::int AS c FROM request_logs
            WHERE offering_id = $1 AND team_id = $2 GROUP BY status_code ORDER BY status_code`,
          [offering.code, team.teamCode],
        ),
        this.loggingDb.query(
          `SELECT min(started_at) AS first_activity, max(started_at) AS last_activity
             FROM request_logs WHERE offering_id = $1 AND team_id = $2`,
          [offering.code, team.teamCode],
        ),
        this.controlDb.query(
          `SELECT count(*)::int AS c FROM reset_requests WHERE team_id = $1 AND status = 'succeeded'`,
          [team.id],
        ),
      ]);

      results.push({
        team,
        members,
        totalRequests: totals.rows[0].c,
        requestsByMethod: Object.fromEntries(byMethod.rows.map((r) => [r.method, r.c])),
        statusCodeDistribution: Object.fromEntries(
          byStatus.rows.map((r) => [r.status_code ?? 'unknown', r.c]),
        ),
        firstActivity: firstLast.rows[0].first_activity,
        lastActivity: firstLast.rows[0].last_activity,
        resetCount: resetCount.rows[0].c,
      });
    }
    return results;
  }

  async studentActivity(offeringId: string) {
    const offering = await this.offerings.findById(offeringId);
    if (!offering) return [];

    const result = await this.loggingDb.query(
      `SELECT student_id,
              count(*)::int AS request_count,
              count(*) FILTER (WHERE method = 'GET')::int AS get_count,
              count(*) FILTER (WHERE method = 'POST')::int AS post_count,
              count(*) FILTER (WHERE method IN ('PUT','PATCH'))::int AS put_patch_count,
              count(*) FILTER (WHERE method = 'DELETE')::int AS delete_count,
              count(*) FILTER (WHERE status_code >= 400 AND status_code < 500)::int AS status_4xx,
              count(*) FILTER (WHERE status_code >= 500)::int AS status_5xx,
              min(started_at) AS first_activity,
              max(started_at) AS last_activity
         FROM request_logs
        WHERE offering_id = $1
        GROUP BY student_id
        ORDER BY request_count DESC`,
      [offering.code],
    );

    const teamByStudent = new Map<string, string>();
    const teams = await this.teams.listByOffering(offeringId);
    for (const team of teams) {
      for (const member of await this.teams.membersOf(team.id)) {
        teamByStudent.set(member, team.teamCode);
      }
    }

    return result.rows.map((row) => ({
      studentId: row.student_id,
      teamCode: teamByStudent.get(row.student_id) ?? 'unknown',
      requestCount: row.request_count,
      getCount: row.get_count,
      postCount: row.post_count,
      putPatchCount: row.put_patch_count,
      deleteCount: row.delete_count,
      status4xx: row.status_4xx,
      status5xx: row.status_5xx,
      firstActivity: row.first_activity,
      lastActivity: row.last_activity,
    }));
  }

  async requestLookup(requestId: string) {
    const result = await this.loggingDb.query(
      `SELECT * FROM request_logs WHERE request_id = $1`,
      [requestId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Row-level data backing the interactive activity report (spec section 24).
   * `dedup_hash` is computed on the fly (method+path+query+body+student) so
   * the client can tell apart genuinely distinct requests from retries of
   * the exact same call, without needing a stored hash column.
   */
  async activityReportData(offeringCode?: string) {
    const params: unknown[] = [];
    let where = '';
    if (offeringCode) {
      params.push(offeringCode);
      where = 'WHERE offering_id = $1';
    }
    const result = await this.loggingDb.query(
      `SELECT request_id, offering_id, team_id, student_id, started_at,
              method, path, query_string, status_code, response_time_ms,
              application_authenticated,
              dedup_hash
         FROM request_logs
         ${where}
        ORDER BY started_at ASC NULLS LAST`,
      params,
    );
    return result.rows;
  }

  async listOfferingCodes() {
    const offerings = await this.offerings.listAll();
    return offerings.map((o) => ({ id: o.id, code: o.code, status: o.status }));
  }

  async exportActivityReportCsv(offeringId: string): Promise<string> {
    const students = await this.studentActivity(offeringId);
    const header =
      'student_id,team_code,request_count,get_count,post_count,put_patch_count,delete_count,status_4xx,status_5xx,first_activity,last_activity';
    const lines = students.map((s) =>
      [
        s.studentId,
        s.teamCode,
        s.requestCount,
        s.getCount,
        s.postCount,
        s.putPatchCount,
        s.deleteCount,
        s.status4xx,
        s.status5xx,
        s.firstActivity?.toISOString?.() ?? s.firstActivity,
        s.lastActivity?.toISOString?.() ?? s.lastActivity,
      ].join(','),
    );
    return [header, ...lines].join('\n') + '\n';
  }
}
