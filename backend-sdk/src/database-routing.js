const { Pool } = require('pg');

/**
 * Lazily creates and reuses one small connection pool per team database
 * (spec section 19). A buggy backend never needs its own control database
 * — it only ever needs the `databaseName` already resolved and signed by
 * the gateway inside the verified context.
 *
 * @param {string} adminConnectionUrl - e.g. postgres://user:pass@host:5432/postgres
 *   (the path/database segment is replaced per team)
 * @param {object} [options]
 * @param {number} [options.maxPoolSize=2] - per-team pool size ceiling
 */
function createTeamDatabaseRouter(adminConnectionUrl, options = {}) {
  const maxPoolSize = options.maxPoolSize ?? 2;
  /** @type {Map<string, import('pg').Pool>} */
  const pools = new Map();

  function getPool(databaseName) {
    let pool = pools.get(databaseName);
    if (pool) return pool;

    const url = new URL(adminConnectionUrl);
    url.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: url.toString(), max: maxPoolSize });
    pools.set(databaseName, pool);
    return pool;
  }

  async function closeAll() {
    await Promise.all([...pools.values()].map((p) => p.end()));
    pools.clear();
  }

  return { getPool, closeAll };
}

module.exports = { createTeamDatabaseRouter };
