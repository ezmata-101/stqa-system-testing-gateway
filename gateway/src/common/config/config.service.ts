import { Injectable } from '@nestjs/common';

/**
 * Loads and validates environment configuration. This service is the single
 * source of truth for env-driven settings; everything semester/assignment
 * specific lives in the control database instead (see spec section 27).
 */
@Injectable()
export class ConfigService {
  readonly gatewayPublicUrl: string;
  readonly port: number;

  readonly controlDatabaseUrl: string;
  readonly loggingDatabaseUrl: string;
  readonly teamDatabaseAdminUrl: string;
  readonly redisUrl: string;

  readonly contextSigningSecret: string;
  readonly credentialHashSecret: string;
  readonly ipHashSecret: string;

  readonly defaultRequestTimeoutMs: number;
  readonly defaultMaxBodySize: number;
  readonly defaultRateLimit: number;
  readonly defaultContextTokenTtlSeconds: number;

  readonly backendNetworkAllowlist: string[];
  readonly adminAuthSecret: string;
  readonly sessionSecret: string;

  readonly maxLoggedBodyBytes: number;
  readonly maxTeamDbPoolSize: number;
  readonly maxGlobalTeamDbConnections: number;
  readonly teamDbPoolIdleTimeoutMs: number;

  constructor() {
    this.gatewayPublicUrl = this.req('GATEWAY_PUBLIC_URL', 'http://localhost:3000');
    this.port = parseInt(this.req('PORT', '3000'), 10);

    this.controlDatabaseUrl = this.req('CONTROL_DATABASE_URL');
    this.loggingDatabaseUrl = this.req('LOGGING_DATABASE_URL');
    this.teamDatabaseAdminUrl = this.req('TEAM_DATABASE_ADMIN_URL');
    this.redisUrl = this.req('REDIS_URL', 'redis://localhost:6379');

    this.contextSigningSecret = this.req('CONTEXT_SIGNING_SECRET');
    this.credentialHashSecret = this.req('CREDENTIAL_HASH_SECRET');
    this.ipHashSecret = this.req('IP_HASH_SECRET');

    this.defaultRequestTimeoutMs = parseInt(this.req('DEFAULT_REQUEST_TIMEOUT_MS', '15000'), 10);
    this.defaultMaxBodySize = parseInt(this.req('DEFAULT_MAX_BODY_SIZE', '2097152'), 10); // 2 MiB
    this.defaultRateLimit = parseInt(this.req('DEFAULT_RATE_LIMIT', '120'), 10); // requests/min
    this.defaultContextTokenTtlSeconds = parseInt(
      this.req('DEFAULT_CONTEXT_TOKEN_TTL_SECONDS', '60'),
      10,
    );

    this.backendNetworkAllowlist = this.req('BACKEND_NETWORK_ALLOWLIST', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    this.adminAuthSecret = this.req('ADMIN_AUTH_SECRET');
    this.sessionSecret = this.req('SESSION_SECRET', this.adminAuthSecret);

    this.maxLoggedBodyBytes = parseInt(this.req('MAX_LOGGED_BODY_BYTES', '8192'), 10);
    this.maxTeamDbPoolSize = parseInt(this.req('MAX_TEAM_DB_POOL_SIZE', '2'), 10);
    this.maxGlobalTeamDbConnections = parseInt(
      this.req('MAX_GLOBAL_TEAM_DB_CONNECTIONS', '40'),
      10,
    );
    this.teamDbPoolIdleTimeoutMs = parseInt(
      this.req('TEAM_DB_POOL_IDLE_TIMEOUT_MS', '300000'),
      10,
    ); // 5 min
  }

  private req(name: string, fallback?: string): string {
    const value = process.env[name] ?? fallback;
    if (value === undefined) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
  }
}
