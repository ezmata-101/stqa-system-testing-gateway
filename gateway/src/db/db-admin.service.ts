import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigService } from '../common/config/config.service';

/**
 * Connection used only for cluster-level DDL (CREATE DATABASE / DROP
 * DATABASE / TEMPLATE cloning). PostgreSQL requires these statements to run
 * outside a transaction, from a connection to a *different* database than
 * the one being created or dropped — this pool always targets the
 * `postgres` maintenance database on the team database server.
 */
@Injectable()
export class DbAdminService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    const maintenanceUrl = new URL(config.teamDatabaseAdminUrl);
    maintenanceUrl.pathname = '/postgres';
    this.pool = new Pool({ connectionString: maintenanceUrl.toString(), max: 3 });
  }

  /** Creates `databaseName` as a clone of `templateName`. Idempotent-ish: throws if it already exists. */
  async createDatabaseFromTemplate(databaseName: string, templateName: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `CREATE DATABASE ${this.quoteIdent(databaseName)} TEMPLATE ${this.quoteIdent(templateName)}`,
      );
    } finally {
      client.release();
    }
  }

  /** Forcibly terminates connections to and drops a database. Used by reset. */
  async dropDatabase(databaseName: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [databaseName],
      );
      await client.query(`DROP DATABASE IF EXISTS ${this.quoteIdent(databaseName)}`);
    } finally {
      client.release();
    }
  }

  async databaseExists(databaseName: string): Promise<boolean> {
    const result = await this.pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  private quoteIdent(name: string): string {
    if (!/^[a-z0-9_]+$/.test(name)) {
      throw new Error(`Refusing to use unsafe database identifier: ${name}`);
    }
    return `"${name}"`;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
