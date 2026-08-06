#!/usr/bin/env node
/**
 * One-time setup: applies db/schema.sql to a database (normally the
 * template database, e.g. `stqa_template_sp27_api01`, before any teams are
 * provisioned). Run manually or from CI when a semester's template
 * changes.
 *
 * Usage: DATABASE_URL=postgres://... node db/init-template.js
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Set DATABASE_URL to the template database to initialize.');
    process.exit(1);
  }
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(schema);
    console.log(`Schema applied to ${databaseUrl}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
