#!/usr/bin/env node
/**
 * Per-team seed hook, invoked by the gateway's provisioning/reset flow
 * (spec section 13) with env vars: TEAM_DATABASE_URL, TEAM_SEED,
 * OFFERING_CODE, TEAM_CODE. Inserts equivalent-but-team-varied bug
 * conditions — e.g. each team gets a different "vulnerable order ID" and a
 * different stock boundary value, without changing bug category/difficulty.
 *
 * The gateway itself never parses this script's output or logic — it just
 * runs the command configured in the offering's
 * `configuration.seeding.command` (see gateway/src/provisioning/seed-hook.service.ts).
 */
const { Pool } = require('pg');
const crypto = require('crypto');

function deriveInt(seed, salt, min, max) {
  const hash = crypto.createHash('sha256').update(`${seed}:${salt}`).digest();
  const value = hash.readUInt32BE(0);
  return min + (value % (max - min + 1));
}

async function main() {
  const databaseUrl = process.env.TEAM_DATABASE_URL;
  const teamSeed = process.env.TEAM_SEED;
  const teamCode = process.env.TEAM_CODE ?? 'unknown';

  if (!databaseUrl || !teamSeed) {
    console.error('TEAM_DATABASE_URL and TEAM_SEED are required.');
    process.exit(1);
  }

  const boundaryStock = deriveInt(teamSeed, 'boundary-stock', 10, 25);
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Reset any prior seed data for idempotency (safe: this only ever runs
    // against this team's own database).
    await pool.query('TRUNCATE orders, products, users RESTART IDENTITY CASCADE');

    await pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES
       ('admin@stqa.local', $1, 'admin'),
       ('student@stqa.local', $1, 'user')`,
      // Both demo accounts share the placeholder bcrypt hash for "password123".
      ['$2a$10$CwTycUXWue0Thq9StjUM0uJ8n1t8I8QqGx.rXwZ0i1c1n4WBIvI3W'],
    );

    const productResult = await pool.query(
      `INSERT INTO products (name, price, stock) VALUES ('STQA Widget', 9.99, $1) RETURNING id`,
      [boundaryStock],
    );
    const productId = productResult.rows[0].id;

    // Intentional bug fixture: an order that belongs to the admin account,
    // discoverable by students exploiting the missing-ownership-check bug
    // in DELETE/GET /orders/:id.
    await pool.query(
      `INSERT INTO orders (user_id, product_id, quantity, status) VALUES (1, $1, 1, 'confirmed')`,
      [productId],
    );

    console.log(
      `Seeded team ${teamCode}: boundary stock = ${boundaryStock}, vulnerable order id = 1 (owned by admin).`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
