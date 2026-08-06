import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigService } from '../common/config/config.service';

interface RegistryEntry {
  pool: Pool;
  lastUsedAt: number;
}

/**
 * Lazily creates and reuses small connection pools for team databases,
 * evicting the least-recently-used pool once the number of open per-team
 * pools would exceed the configured global connection budget (spec section
 * 19). The gateway itself never queries team databases — only the
 * provisioning and reset services do (e.g. to apply seed data or verify a
 * reset) — so this stays a small, admin-only registry rather than something
 * on the hot request path.
 */
@Injectable()
export class TeamDbRegistryService implements OnModuleDestroy {
  private readonly logger = new Logger(TeamDbRegistryService.name);
  private readonly entries = new Map<string, RegistryEntry>();
  private readonly maxPools: number;
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(private readonly config: ConfigService) {
    this.maxPools = Math.max(
      1,
      Math.floor(config.maxGlobalTeamDbConnections / config.maxTeamDbPoolSize),
    );
    this.sweepTimer = setInterval(() => this.sweepIdle(), 30_000).unref();
  }

  /** Returns (creating if necessary) the pool for a given team database. */
  async getPool(databaseName: string): Promise<Pool> {
    const existing = this.entries.get(databaseName);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing.pool;
    }

    if (this.entries.size >= this.maxPools) {
      this.evictLru();
    }

    const baseUrl = new URL(this.config.teamDatabaseAdminUrl);
    baseUrl.pathname = `/${databaseName}`;
    const pool = new Pool({
      connectionString: baseUrl.toString(),
      max: this.config.maxTeamDbPoolSize,
      idleTimeoutMillis: this.config.teamDbPoolIdleTimeoutMs,
    });
    this.entries.set(databaseName, { pool, lastUsedAt: Date.now() });
    this.logger.log(`Opened pool for team database ${databaseName}`);
    return pool;
  }

  /** Closes and forgets the pool for a database (e.g. before dropping it). */
  async closePool(databaseName: string): Promise<void> {
    const entry = this.entries.get(databaseName);
    if (!entry) return;
    this.entries.delete(databaseName);
    await entry.pool.end().catch(() => undefined);
  }

  private evictLru(): void {
    let oldestKey: string | undefined;
    let oldestAt = Infinity;
    for (const [key, entry] of this.entries) {
      if (entry.lastUsedAt < oldestAt) {
        oldestAt = entry.lastUsedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      void this.closePool(oldestKey);
      this.logger.debug(`Evicted LRU team database pool: ${oldestKey}`);
    }
  }

  private sweepIdle(): void {
    const idleCutoff = Date.now() - this.config.teamDbPoolIdleTimeoutMs;
    for (const [key, entry] of this.entries) {
      if (entry.lastUsedAt < idleCutoff) {
        void this.closePool(key);
      }
    }
  }

  async onModuleDestroy() {
    clearInterval(this.sweepTimer);
    await Promise.all([...this.entries.keys()].map((key) => this.closePool(key)));
  }
}
