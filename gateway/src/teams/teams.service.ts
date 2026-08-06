import { Injectable } from '@nestjs/common';
import { ControlDbService } from '../db/control-db.service';

export interface Team {
  id: string;
  offeringId: string;
  teamCode: string;
  databaseName: string;
  seedValue: string;
}

/**
 * Team lookups and membership queries against the control database
 * (spec section 7 / 14). All members of a team resolve to the same
 * database name.
 */
@Injectable()
export class TeamsService {
  constructor(private readonly db: ControlDbService) {}

  async findByStudentAndOffering(studentId: string, offeringId: string): Promise<Team | null> {
    const result = await this.db.query(
      `SELECT t.id, t.offering_id, t.team_code, t.database_name, t.seed_value
         FROM teams t
         JOIN team_members tm ON tm.team_id = t.id
        WHERE tm.student_id = $1 AND t.offering_id = $2`,
      [studentId, offeringId],
    );
    if (result.rowCount === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findById(teamId: string): Promise<Team | null> {
    const result = await this.db.query(
      `SELECT id, offering_id, team_code, database_name, seed_value FROM teams WHERE id = $1`,
      [teamId],
    );
    if (result.rowCount === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async listByOffering(offeringId: string): Promise<Team[]> {
    const result = await this.db.query(
      `SELECT id, offering_id, team_code, database_name, seed_value
         FROM teams WHERE offering_id = $1 ORDER BY team_code`,
      [offeringId],
    );
    return result.rows.map((r) => this.mapRow(r));
  }

  async membersOf(teamId: string): Promise<string[]> {
    const result = await this.db.query(
      `SELECT student_id FROM team_members WHERE team_id = $1`,
      [teamId],
    );
    return result.rows.map((r) => r.student_id);
  }

  async create(input: {
    offeringId: string;
    teamCode: string;
    databaseName: string;
    seedValue: string;
  }): Promise<Team> {
    const result = await this.db.query(
      `INSERT INTO teams (offering_id, team_code, database_name, seed_value)
       VALUES ($1,$2,$3,$4)
       RETURNING id, offering_id, team_code, database_name, seed_value`,
      [input.offeringId, input.teamCode, input.databaseName, input.seedValue],
    );
    return this.mapRow(result.rows[0]);
  }

  async addMember(teamId: string, studentId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO team_members (team_id, student_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [teamId, studentId],
    );
  }

  private mapRow(row: any): Team {
    return {
      id: row.id,
      offeringId: row.offering_id,
      teamCode: row.team_code,
      databaseName: row.database_name,
      seedValue: row.seed_value,
    };
  }
}
