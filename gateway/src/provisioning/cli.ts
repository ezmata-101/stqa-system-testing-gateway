import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { AppModule } from '../app.module';
import { ProvisioningService } from './provisioning.service';
import { parseRosterCsv } from './roster-parser';

/**
 * CLI: npm run provision -- --offering-code STQA-SPRING-2027-API01
 *        --roster ./roster.csv --out ./credentials.csv [--team-size 4]
 *
 * Reads a roster, creates teams + per-team databases from the offering's
 * template, generates one lab credential per student, and exports the raw
 * keys once (they are never retrievable again — only hashes are stored).
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const offeringCode = args['offering-code'];
  const rosterPath = args['roster'];
  const outPath = args['out'] ?? './credentials.csv';
  const teamSize = args['team-size'] ? parseInt(args['team-size'], 10) : undefined;

  if (!offeringCode || !rosterPath) {
    console.error(
      'Usage: npm run provision -- --offering-code <code> --roster <path> [--out <path>] [--team-size <n>]',
    );
    process.exit(1);
  }

  const appContext = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const provisioning = appContext.get(ProvisioningService);

  const roster = parseRosterCsv(rosterPath);
  console.log(`Loaded ${roster.length} roster rows. Provisioning offering ${offeringCode}...`);

  const result = await provisioning.provision(offeringCode, roster, { teamSize });

  const csvLines = ['student_id,name,email,team_code,lab_key'];
  for (const cred of result.credentials) {
    csvLines.push(
      [cred.studentId, cred.name, cred.email, cred.teamCode, cred.rawKey]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
  }
  writeFileSync(outPath, csvLines.join('\n') + '\n', 'utf8');

  console.log(`Created ${result.teams.length} teams.`);
  console.log(`Exported ${result.credentials.length} credentials to ${outPath}`);
  console.log('IMPORTANT: distribute these keys securely and delete the export file afterward.');

  await appContext.close();
  process.exit(0);
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = value;
    }
  }
  return out;
}

main().catch((err) => {
  console.error('Provisioning failed:', err);
  process.exit(1);
});
