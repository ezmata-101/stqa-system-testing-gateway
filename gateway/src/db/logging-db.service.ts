import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { ConfigService } from '../common/config/config.service';

/**
 * Wrapper around the logging database pool. Kept physically and logically
 * separate from the control database (spec section 15) so that students —
 * who never receive credentials for either — cannot be granted overly broad
 * access by accident, and so operational teams can back up/scale logs
 * independently of control data.
 */
@Injectable()
export class LoggingDbService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({ connectionString: config.loggingDatabaseUrl, max: 10 });
  }

  query<T extends QueryResultRow = any>(text: string, params?: unknown[]) {
    return this.pool.query<T>(text, params as any[]);
  }

  async logRateLimitEvent(entry: {
    requestId: string | null;
    offeringId: string;
    teamId: string | null;
    studentId: string | null;
    scope: string;
    limitKey: string;
  }): Promise<void> {
    await this.query(
      `INSERT INTO rate_limit_events (request_id, offering_id, team_id, student_id, scope, limit_key)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [entry.requestId, entry.offeringId, entry.teamId, entry.studentId, entry.scope, entry.limitKey],
    );
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
