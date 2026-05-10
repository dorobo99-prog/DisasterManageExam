let pgPool = null;
let ppgDb = null;
let warnedFallback = false;

function isPostgresUrl(value) {
  return /^postgres(ql)?:\/\//i.test(String(value || ''));
}

function getPgConnectionString() {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.PRISMA_DIRECT_TCP_URL,
    process.env.PRISMA_DATABASE_URL
  ];

  for (const value of candidates) {
    if (isPostgresUrl(value)) return value;
  }

  return '';
}

function getPpgConnectionString() {
  return (
    process.env.PRISMA_DATABASE_URL ||
    process.env.PRISMA_DIRECT_TCP_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ''
  );
}

function normalizeParams(params) {
  if (Array.isArray(params)) return params;
  if (params == null) return [];
  return [params];
}

function getPgPool() {
  const connectionString = getPgConnectionString();

  if (!connectionString) return null;

  if (!pgPool) {
    const { Pool } = require('pg');

    pgPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
      ssl: connectionString.indexOf('sslmode=require') >= 0
        ? { rejectUnauthorized: false }
        : undefined
    });
  }

  return pgPool;
}

function getPpgDb() {
  const connectionString = getPpgConnectionString();

  if (!connectionString) return null;

  if (!ppgDb) {
    const { prismaPostgres, defaultClientConfig } = require('@prisma/ppg');
    ppgDb = prismaPostgres(defaultClientConfig(connectionString));
  }

  return ppgDb;
}

function makePgTransactionClient(client) {
  return {
    query: function(text, ...params) {
      return {
        collect: async function() {
          const result = await client.query(text, params);
          return result.rows || [];
        }
      };
    },

    exec: async function(text, ...params) {
      const result = await client.query(text, params);
      return result.rowCount || 0;
    }
  };
}

async function query(text, params) {
  const pool = getPgPool();

  if (pool) {
    const result = await pool.query(text, normalizeParams(params));

    return {
      rows: result.rows || [],
      disabled: false,
      driver: 'pg'
    };
  }

  const client = getPpgDb();

  if (!client) {
    return {
      rows: [],
      disabled: true,
      driver: 'none'
    };
  }

  if (!warnedFallback) {
    console.warn('DB fallback: using @prisma/ppg because no postgres URL was found for pg.');
    warnedFallback = true;
  }

  const rows = await client.query(text, ...(params || [])).collect();

  return {
    rows,
    disabled: false,
    driver: 'ppg'
  };
}

async function exec(text, params) {
  const pool = getPgPool();

  if (pool) {
    const result = await pool.query(text, normalizeParams(params));

    return {
      affected: result.rowCount || 0,
      disabled: false,
      driver: 'pg'
    };
  }

  const client = getPpgDb();

  if (!client) {
    return {
      affected: 0,
      disabled: true,
      driver: 'none'
    };
  }

  if (!warnedFallback) {
    console.warn('DB fallback: using @prisma/ppg because no postgres URL was found for pg.');
    warnedFallback = true;
  }

  const affected = await client.exec(text, ...(params || []));

  return {
    affected,
    disabled: false,
    driver: 'ppg'
  };
}

async function transaction(fn) {
  const pool = getPgPool();

  if (pool) {
    const client = await pool.connect();

    try {
      await client.query('begin');

      const tx = makePgTransactionClient(client);
      const result = await fn(tx);

      await client.query('commit');

      return result;
    } catch (err) {
      try {
        await client.query('rollback');
      } catch (rollbackErr) {
        console.error('transaction rollback failed:', rollbackErr);
      }

      throw err;
    } finally {
      client.release();
    }
  }

  const client = getPpgDb();

  if (!client) {
    return {
      disabled: true
    };
  }

  if (!warnedFallback) {
    console.warn('DB fallback: using @prisma/ppg because no postgres URL was found for pg.');
    warnedFallback = true;
  }

  return client.transaction(fn);
}

module.exports = {
  query,
  exec,
  transaction
};