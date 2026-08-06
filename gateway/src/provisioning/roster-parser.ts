import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { RosterRow } from './roster.types';

/**
 * Parses a roster CSV with columns: student_id,name,email,section,team_code.
 * `team_code` and `section` are optional — when `team_code` is omitted,
 * ProvisioningService auto-assigns teams by chunking the roster.
 */
export function parseRosterCsv(path: string): RosterRow[] {
  const content = readFileSync(path, 'utf8');
  const records: Record<string, string>[] = parse(content, {
    columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
  });

  return records.map((row) => ({
    studentId: row['student_id'],
    name: row['name'],
    email: row['email'],
    section: row['section'] || undefined,
    teamCode: row['team_code'] || undefined,
  }));
}
