const crypto = require('crypto');
const { query, exec } = require('./_db');

let ready = false;

async function ensureAccountTables() {
  if (ready) return;
  await exec(
    'create table if not exists exam_users (id text primary key, nickname text not null unique, pin_salt text not null, pin_hash text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())',
    []
  );
  await exec(
    'create table if not exists exam_progress (user_id text not null references exam_users(id) on delete cascade, nickname text not null, set_id text not null, answers jsonb not null default \'{}\'::jsonb, graded boolean not null default false, started_at timestamptz, saved_at timestamptz not null default now(), primary key (user_id, set_id))',
    []
  );
  await exec(
    'create index if not exists idx_exam_progress_nickname on exam_progress(nickname)',
    []
  );
  ready = true;
}

function hashPin(pin, salt) {
  return crypto.pbkdf2Sync(pin, salt, 120000, 32, 'sha256').toString('hex');
}

function normalizeNickname(name) {
  return String(name || '').trim();
}

function isValidPin(pin) {
  return /^[0-9]{4}$/.test(String(pin || ''));
}

async function findUserByNickname(nickname) {
  await ensureAccountTables();
  var result = await query(
    'select id, nickname, pin_salt, pin_hash from exam_users where nickname = $1 limit 1',
    [nickname]
  );
  return result.rows[0] || null;
}

async function createUser(nickname, pin) {
  await ensureAccountTables();
  var id = crypto.randomUUID();
  var salt = crypto.randomBytes(16).toString('hex');
  var pinHash = hashPin(pin, salt);
  await exec(
    'insert into exam_users (id, nickname, pin_salt, pin_hash) values ($1, $2, $3, $4)',
    [id, nickname, salt, pinHash]
  );
  return { id: id, nickname: nickname };
}

function verifyPin(user, pin) {
  if (!user) return false;
  var candidate = hashPin(pin, user.pin_salt);
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(user.pin_hash, 'hex'));
}

module.exports = {
  ensureAccountTables,
  normalizeNickname,
  isValidPin,
  findUserByNickname,
  createUser,
  verifyPin
};
