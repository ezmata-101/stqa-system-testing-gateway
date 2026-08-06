import { Injectable } from '@nestjs/common';
import { ControlDbService } from '../db/control-db.service';

export interface AssignmentOffering {
  id: string;
  semesterId: string;
  backendVersionId: string;
  code: string;
  activeFrom: Date;
  activeUntil: Date;
  status: 'draft' | 'active' | 'closed';
  maximumTeamSize: number;
  resetLimitPerDay: number;
  configuration: Record<string, any>;
}

export interface BackendVersion {
  id: string;
  name: string;
  version: string;
  backendUrl: string;
  healthcheckPath: string;
  databaseTemplate: string;
  status: string;
}

/**
 * Reads assignment offering configuration from the control database.
 * Nothing about the buggy backend's routes or schema is known here — only
 * where to forward requests (spec section 5).
 */
@Injectable()
export class OfferingsService {
  constructor(private readonly db: ControlDbService) {}

  async findByCode(code: string): Promise<AssignmentOffering | null> {
    const result = await this.db.query(
      `SELECT id, semester_id, backend_version_id, code, active_from, active_until,
              status, maximum_team_size, reset_limit_per_day, configuration
         FROM assignment_offerings WHERE code = $1`,
      [code],
    );
    if (result.rowCount === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<AssignmentOffering | null> {
    const result = await this.db.query(
      `SELECT id, semester_id, backend_version_id, code, active_from, active_until,
              status, maximum_team_size, reset_limit_per_day, configuration
         FROM assignment_offerings WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async listAll(): Promise<AssignmentOffering[]> {
    const result = await this.db.query(
      `SELECT id, semester_id, backend_version_id, code, active_from, active_until,
              status, maximum_team_size, reset_limit_per_day, configuration
         FROM assignment_offerings ORDER BY created_at DESC`,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async getBackendVersion(id: string): Promise<BackendVersion | null> {
    const result = await this.db.query(
      `SELECT id, name, version, backend_url, healthcheck_path, database_template, status
         FROM backend_versions WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      backendUrl: row.backend_url,
      healthcheckPath: row.healthcheck_path,
      databaseTemplate: row.database_template,
      status: row.status,
    };
  }

  /** True when `now` falls within the offering's active window and status is 'active'. */
  isActive(offering: AssignmentOffering, now = new Date()): boolean {
    return (
      offering.status === 'active' &&
      now >= offering.activeFrom &&
      now <= offering.activeUntil
    );
  }

  async create(input: {
    semesterId: string;
    backendVersionId: string;
    code: string;
    activeFrom: Date;
    activeUntil: Date;
    maximumTeamSize: number;
    resetLimitPerDay: number;
    configuration: Record<string, any>;
  }): Promise<AssignmentOffering> {
    const result = await this.db.query(
      `INSERT INTO assignment_offerings
         (semester_id, backend_version_id, code, active_from, active_until, status,
          maximum_team_size, reset_limit_per_day, configuration)
       VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8)
       RETURNING id, semester_id, backend_version_id, code, active_from, active_until,
                 status, maximum_team_size, reset_limit_per_day, configuration`,
      [
        input.semesterId,
        input.backendVersionId,
        input.code,
        input.activeFrom,
        input.activeUntil,
        input.maximumTeamSize,
        input.resetLimitPerDay,
        JSON.stringify(input.configuration),
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async setStatus(id: string, status: 'draft' | 'active' | 'closed'): Promise<void> {
    await this.db.query(`UPDATE assignment_offerings SET status = $2 WHERE id = $1`, [
      id,
      status,
    ]);
  }

  private mapRow(row: any): AssignmentOffering {
    return {
      id: row.id,
      semesterId: row.semester_id,
      backendVersionId: row.backend_version_id,
      code: row.code,
      activeFrom: new Date(row.active_from),
      activeUntil: new Date(row.active_until),
      status: row.status,
      maximumTeamSize: row.maximum_team_size,
      resetLimitPerDay: row.reset_limit_per_day,
      configuration: row.configuration ?? {},
    };
  }
}
