/**
 * Logging database schema (spec section 15/16). Kept generic and
 * endpoint-agnostic — no product/order/payment specific columns.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  pgm.createTable('request_logs', {
    request_id: { type: 'uuid', primaryKey: true },
    offering_id: { type: 'text', notNull: true },
    team_id: { type: 'text' },
    student_id: { type: 'text' },
    started_at: { type: 'timestamptz', notNull: true },
    completed_at: { type: 'timestamptz' },
    method: { type: 'text', notNull: true },
    path: { type: 'text', notNull: true },
    query_string: { type: 'text' },
    status_code: { type: 'integer' },
    response_time_ms: { type: 'integer' },
    request_headers: { type: 'jsonb' },
    request_body: { type: 'text' },
    request_body_hash: { type: 'text' },
    response_headers: { type: 'jsonb' },
    response_body_hash: { type: 'text' },
    application_user_id: { type: 'text' },
    application_role: { type: 'text' },
    application_authenticated: { type: 'boolean' },
    application_token_hash: { type: 'text' },
    source_ip_hash: { type: 'text' },
    user_agent: { type: 'text' },
    error_type: { type: 'text' },
  });

  pgm.createIndex('request_logs', ['offering_id', 'team_id']);
  pgm.createIndex('request_logs', ['offering_id', 'student_id']);
  pgm.createIndex('request_logs', ['started_at']);
  pgm.createIndex('request_logs', ['status_code']);

  pgm.createTable('rate_limit_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    request_id: { type: 'uuid' },
    offering_id: { type: 'text', notNull: true },
    team_id: { type: 'text' },
    student_id: { type: 'text' },
    scope: { type: 'text', notNull: true }, // student|team|ip
    limit_key: { type: 'text', notNull: true },
    occurred_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('rate_limit_events', ['offering_id', 'team_id']);
};

exports.down = (pgm) => {
  pgm.dropTable('rate_limit_events');
  pgm.dropTable('request_logs');
};
