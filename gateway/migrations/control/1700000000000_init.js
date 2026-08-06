/**
 * Control database schema (spec section 14). Permanent, independent of team
 * databases, holds only configuration and identity/mapping data — never
 * assignment content.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  pgm.createTable('semesters', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    starts_at: { type: 'timestamptz', notNull: true },
    ends_at: { type: 'timestamptz', notNull: true },
  });

  pgm.createTable('backend_versions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    version: { type: 'text', notNull: true },
    backend_url: { type: 'text', notNull: true },
    healthcheck_path: { type: 'text', notNull: true, default: '/_internal/health' },
    database_template: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('assignment_offerings', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    semester_id: {
      type: 'uuid',
      notNull: true,
      references: 'semesters',
      onDelete: 'restrict',
    },
    backend_version_id: {
      type: 'uuid',
      notNull: true,
      references: 'backend_versions',
      onDelete: 'restrict',
    },
    code: { type: 'text', notNull: true, unique: true },
    active_from: { type: 'timestamptz', notNull: true },
    active_until: { type: 'timestamptz', notNull: true },
    status: { type: 'text', notNull: true, default: 'draft' }, // draft|active|closed
    maximum_team_size: { type: 'integer', notNull: true, default: 4 },
    reset_limit_per_day: { type: 'integer', notNull: true, default: 3 },
    configuration: { type: 'jsonb', notNull: true, default: '{}' }, // rate limits, logging policy, etc.
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('teams', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    offering_id: {
      type: 'uuid',
      notNull: true,
      references: 'assignment_offerings',
      onDelete: 'cascade',
    },
    team_code: { type: 'text', notNull: true },
    database_name: { type: 'text', notNull: true, unique: true },
    seed_value: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('teams', 'teams_offering_code_unique', {
    unique: ['offering_id', 'team_code'],
  });

  pgm.createTable('students', {
    student_id: { type: 'text', primaryKey: true },
    name: { type: 'text', notNull: true },
    email: { type: 'text', notNull: true },
    section: { type: 'text' },
  });

  pgm.createTable('team_members', {
    team_id: { type: 'uuid', notNull: true, references: 'teams', onDelete: 'cascade' },
    student_id: {
      type: 'text',
      notNull: true,
      references: 'students',
      onDelete: 'cascade',
    },
  });
  pgm.addConstraint('team_members', 'team_members_pkey', {
    primaryKey: ['team_id', 'student_id'],
  });

  pgm.createTable('student_credentials', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    offering_id: {
      type: 'uuid',
      notNull: true,
      references: 'assignment_offerings',
      onDelete: 'cascade',
    },
    student_id: {
      type: 'text',
      notNull: true,
      references: 'students',
      onDelete: 'cascade',
    },
    credential_hash: { type: 'text', notNull: true, unique: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
    revoked_at: { type: 'timestamptz' },
    last_used_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('student_credentials', 'student_credentials_offering_student_unique', {
    unique: ['offering_id', 'student_id'],
  });

  pgm.createTable('reset_requests', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    offering_id: {
      type: 'uuid',
      notNull: true,
      references: 'assignment_offerings',
      onDelete: 'cascade',
    },
    team_id: { type: 'uuid', notNull: true, references: 'teams', onDelete: 'cascade' },
    requested_by: { type: 'text', notNull: true }, // student_id
    requested_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    completed_at: { type: 'timestamptz' },
    status: { type: 'text', notNull: true, default: 'pending' }, // pending|running|succeeded|failed
    failure_reason: { type: 'text' },
  });

  pgm.createIndex('student_credentials', 'credential_hash');
  pgm.createIndex('teams', ['offering_id']);
  pgm.createIndex('reset_requests', ['team_id', 'requested_at']);
  // Enforces "prevent simultaneous resets" (spec section 20) at the DB level:
  // only one 'running' reset_requests row may exist per team at a time.
  pgm.createIndex('reset_requests', ['team_id'], {
    name: 'reset_requests_one_running_per_team',
    unique: true,
    where: "status = 'running'",
  });
};

exports.down = (pgm) => {
  pgm.dropTable('reset_requests');
  pgm.dropTable('student_credentials');
  pgm.dropTable('team_members');
  pgm.dropTable('students');
  pgm.dropTable('teams');
  pgm.dropTable('assignment_offerings');
  pgm.dropTable('backend_versions');
  pgm.dropTable('semesters');
};
