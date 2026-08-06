-- Runs once when the postgres container's data directory is first
-- initialized (docker-entrypoint-initdb.d convention). Creates the
-- permanent control/logging databases plus a demo template database for
-- the example-buggy-api backend (spec sections 12, 14, 15).
CREATE DATABASE stqa_control;
CREATE DATABASE stqa_logging;
CREATE DATABASE stqa_template_demo;
