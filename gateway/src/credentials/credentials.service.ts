import { Injectable } from '@nestjs/common';
import { ControlDbService } from '../db/control-db.service';
import { ConfigService } from '../common/config/config.service';
import { generateLabKey, hashLabKey } from '../common/util/crypto.util';

export interface StudentCredentialRecord {
  id: string;
  offeringId: string;
  studentId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export type CredentialVerificationResult =
  | { status: 'ok'; record: StudentCredentialRecord }
  | { status: 'not_found' | 'expired' | 'revoked' };

/**
 * Lab credential lifecycle (spec section 7 / 23): random generation,
 * hash-only storage, expiration, and revocation. Raw keys are never
 * persisted or logged — only their HMAC hash.
 */
@Injectable()
export class CredentialsService {
  constructor(
    private readonly db: ControlDbService,
    private readonly config: ConfigService,
  ) {}

  /** Generates a brand-new lab key for a student in an offering and stores only its hash. */
  async issue(offeringId: string, studentId: string, expiresAt: Date): Promise<string> {
    const rawKey = generateLabKey();
    const hash = hashLabKey(rawKey, this.config.credentialHashSecret);
    await this.db.query(
      `INSERT INTO student_credentials (offering_id, student_id, credential_hash, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (offering_id, student_id)
       DO UPDATE SET credential_hash = EXCLUDED.credential_hash,
                      expires_at = EXCLUDED.expires_at,
                      revoked_at = NULL,
                      created_at = now()`,
      [offeringId, studentId, hash, expiresAt],
    );
    return rawKey;
  }

  /**
   * Resolves a raw lab key to its credential record. The discriminated
   * result lets callers distinguish MISSING/INVALID/EXPIRED/REVOKED so the
   * gateway can return the precise error code from spec section 28.
   */
  async verify(rawKey: string): Promise<CredentialVerificationResult> {
    const hash = hashLabKey(rawKey, this.config.credentialHashSecret);
    const result = await this.db.query(
      `SELECT id, offering_id, student_id, expires_at, revoked_at
         FROM student_credentials WHERE credential_hash = $1`,
      [hash],
    );
    if (result.rowCount === 0) return { status: 'not_found' };
    const row = result.rows[0];
    const record: StudentCredentialRecord = {
      id: row.id,
      offeringId: row.offering_id,
      studentId: row.student_id,
      expiresAt: new Date(row.expires_at),
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    };
    if (record.revokedAt) return { status: 'revoked' };
    if (record.expiresAt.getTime() < Date.now()) return { status: 'expired' };

    // Fire-and-forget last-used-at update; not on the critical path.
    void this.db
      .query(`UPDATE student_credentials SET last_used_at = now() WHERE id = $1`, [record.id])
      .catch(() => undefined);

    return { status: 'ok', record };
  }

  async revoke(offeringId: string, studentId: string): Promise<void> {
    await this.db.query(
      `UPDATE student_credentials SET revoked_at = now()
        WHERE offering_id = $1 AND student_id = $2`,
      [offeringId, studentId],
    );
  }

  async listForOffering(offeringId: string) {
    const result = await this.db.query(
      `SELECT sc.student_id, s.name, s.email, sc.created_at, sc.expires_at,
              sc.revoked_at, sc.last_used_at
         FROM student_credentials sc
         JOIN students s ON s.student_id = sc.student_id
        WHERE sc.offering_id = $1
        ORDER BY s.name`,
      [offeringId],
    );
    return result.rows;
  }
}
