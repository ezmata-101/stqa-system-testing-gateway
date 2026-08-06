import { Injectable, Logger } from '@nestjs/common';
import { LoggingDbService } from '../db/logging-db.service';
import { ConfigService } from '../common/config/config.service';
import { redactBody, redactHeaders, truncateForLog } from '../common/util/redact';
import { hashWithSecret, sha256Hex } from '../common/util/crypto.util';

export interface RequestLogEntry {
  requestId: string;
  offeringId: string; // offering code (human-readable) is fine here, control DB has the UUID separately
  teamId: string | null;
  studentId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  method: string;
  path: string;
  queryString: string | null;
  statusCode: number | null;
  responseTimeMs: number | null;
  requestHeaders: Record<string, unknown>;
  requestBody: unknown;
  responseHeaders: Record<string, unknown> | null;
  responseBody: unknown;
  applicationUserId?: string | null;
  applicationRole?: string | null;
  applicationAuthenticated?: boolean | null;
  applicationTokenHash?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
  errorType?: string | null;
}

/**
 * Persists one row per request to the logging database (spec sections
 * 15-17). Every request is logged — success, failure, public or protected —
 * with sensitive values redacted/hashed rather than stored raw. Logging
 * happens asynchronously so a slow logging DB never blocks the response
 * path to the student.
 */
@Injectable()
export class RequestLoggerService {
  private readonly logger = new Logger(RequestLoggerService.name);

  constructor(
    private readonly db: LoggingDbService,
    private readonly config: ConfigService,
  ) {}

  log(entry: RequestLogEntry): void {
    void this.persist(entry).catch((err) => {
      this.logger.error(`Failed to persist request log ${entry.requestId}: ${err.message}`);
    });
  }

  private async persist(entry: RequestLogEntry): Promise<void> {
    const maxBytes = this.config.maxLoggedBodyBytes;

    const redactedRequestBody = redactBody(entry.requestBody);
    const { text: requestBodyText } = truncateForLog(redactedRequestBody, maxBytes);
    const requestBodyHash = entry.requestBody
      ? sha256Hex(JSON.stringify(entry.requestBody))
      : null;

    const redactedResponseBody = redactBody(entry.responseBody);
    const responseBodyHash = entry.responseBody
      ? sha256Hex(JSON.stringify(redactedResponseBody))
      : null;

    const sourceIpHash = entry.sourceIp
      ? hashWithSecret(entry.sourceIp, this.config.ipHashSecret)
      : null;

    await this.db.query(
      `INSERT INTO request_logs (
         request_id, offering_id, team_id, student_id, started_at, completed_at,
         method, path, query_string, status_code, response_time_ms,
         request_headers, request_body, request_body_hash,
         response_headers, response_body_hash,
         application_user_id, application_role, application_authenticated,
         application_token_hash, source_ip_hash, user_agent, error_type
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
       )
       ON CONFLICT (request_id) DO UPDATE SET
         completed_at = EXCLUDED.completed_at,
         status_code = EXCLUDED.status_code,
         response_time_ms = EXCLUDED.response_time_ms,
         response_headers = EXCLUDED.response_headers,
         response_body_hash = EXCLUDED.response_body_hash,
         application_user_id = EXCLUDED.application_user_id,
         application_role = EXCLUDED.application_role,
         application_authenticated = EXCLUDED.application_authenticated,
         application_token_hash = EXCLUDED.application_token_hash,
         error_type = EXCLUDED.error_type`,
      [
        entry.requestId,
        entry.offeringId,
        entry.teamId,
        entry.studentId,
        entry.startedAt,
        entry.completedAt,
        entry.method,
        entry.path,
        entry.queryString,
        entry.statusCode,
        entry.responseTimeMs,
        JSON.stringify(redactHeaders(entry.requestHeaders as any)),
        requestBodyText,
        requestBodyHash,
        entry.responseHeaders ? JSON.stringify(redactHeaders(entry.responseHeaders as any)) : null,
        responseBodyHash,
        entry.applicationUserId ?? null,
        entry.applicationRole ?? null,
        entry.applicationAuthenticated ?? null,
        entry.applicationTokenHash ?? null,
        sourceIpHash,
        entry.userAgent ?? null,
        entry.errorType ?? null,
      ],
    );
  }
}
