const { prismaPostgres, defaultClientConfig } = require('@prisma/ppg');

let db;

function getConnectionString() {
  return (
    process.env.PRISMA_DIRECT_TCP_URL ||
    process.env.PRISMA_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ''
  );
}

function getDb() {
  const connectionString = getConnectionString();
  if (!connectionString) return null;
  if (!db) {
    db = prismaPostgres(defaultClientConfig(connectionString));
  }
  return db;
}

async function query(text, params) {
  const client = getDb();
  if (!client) return { rows: [], disabled: true };
  const rows = await client.query(text, ...(params || [])).collect();
  return { rows, disabled: false };
}

async function exec(text, params) {
  const client = getDb();
  if (!client) return { affected: 0, disabled: true };
  const affected = await client.exec(text, ...(params || []));
  return { affected, disabled: false };
}

async function transaction(fn) {
  const client = getDb();
  if (!client) return { disabled: true };
  return client.transaction(fn);
}

module.exports = { query, exec, transaction };
