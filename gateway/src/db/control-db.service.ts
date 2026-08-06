import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { ConfigService } from '../common/config/config.service';

/**
 * Thin wrapper around a single permanent `pg.Pool` for the control database.
 * The control database is small (a handful of rows per team/student) so a
 * single shared pool is sufficient — no lazy/LRU management needed here
 * (that concern only applies to the many team databases, see
 * TeamDbRegistryService).
 */
@Injectable()
export class ControlDbService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({ connectionString: config.controlDatabaseUrl, max: 10 });
  }

  query<T extends QueryResultRow = any>(text: string, params?: unknown[]) {
    return this.pool.query<T>(text, params as any[]);
  }

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
