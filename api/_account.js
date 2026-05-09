const crypto = require('crypto');
const { query, exec } = require('./_db');

let ready = false;

async function execIfTableExists(sql) {
  try {
    await exec(sql, []);
  } catch (err) {
    if (!needsSchemaBootstrap(err)) throw err;
  }
}

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
  await exec(
    'create table if not exists exam_cache (cache_key text primary key, payload jsonb not null, expires_at timestamptz not null, updated_at timestamptz not null default now())',
    []
  );
  await execIfTableExists(
    'create index if not exists idx_exam_attempts_nickname on exam_attempts(nickname)'
  );
  await execIfTableExists(
    'create index if not exists idx_exam_attempts_nickname_set_finished on exam_attempts(nickname, set_id, finished_at desc)'
  );
  await execIfTableExists(
    'create index if not exists idx_exam_attempts_nickname_set_score on exam_attempts(nickname, set_id, score desc)'
  );
  await execIfTableExists(
    'create index if not exists idx_exam_attempts_score on exam_attempts(score)'
  );
  await execIfTableExists(
    'create index if not exists idx_exam_answers_set_question on exam_answers(set_id, question_id)'
  );
  await execIfTableExists(
    'create index if not exists idx_exam_answers_attempt on exam_answers(attempt_id)'
  );
  ready = true;
}

function needsSchemaBootstrap(err) {
  var msg = String((err && (err.code || err.message)) || err || '').toLowerCase();
  return msg.indexOf('does not exist') >= 0 ||
    msg.indexOf('undefined_table') >= 0 ||
    msg.indexOf('42p01') >= 0;
}

async function withSchemaFallback(operation) {
  try {
    return await operation();
  } catch (err) {
    if (!needsSchemaBootstrap(err)) throw err;
    await ensureAccountTables();
    return operation();
  }
}

function hashPin(pin, salt) {
  return new Promise(function(resolve, reject) {
    crypto.pbkdf2(pin, salt, 120000, 32, 'sha256', function(err, derivedKey) {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey.toString('hex'));
    });
  });
}

function normalizeNickname(name) {
  return String(name || '').trim();
}

function isValidPin(pin) {
  return /^[0-9]{4}$/.test(String(pin || ''));
}

async function findUserByNickname(nickname) {
  var result = await withSchemaFallback(function() {
    return query(
      'select id, nickname, pin_salt, pin_hash from exam_users where nickname = $1 limit 1',
      [nickname]
    );
  });
  return result.rows[0] || null;
}

async function createUser(nickname, pin) {
  var id = crypto.randomUUID();
  var salt = crypto.randomBytes(16).toString('hex');
  var pinHash = await hashPin(pin, salt);
  await withSchemaFallback(function() {
    return exec(
      'insert into exam_users (id, nickname, pin_salt, pin_hash) values ($1, $2, $3, $4)',
      [id, nickname, salt, pinHash]
    );
  });
  return { id: id, nickname: nickname };
}

async function resetUserPinAndProgress(user, pin) {
  var salt = crypto.randomBytes(16).toString('hex');
  var pinHash = await hashPin(pin, salt);
  await withSchemaFallback(async function() {
    await exec(
      'update exam_users set pin_salt = $1, pin_hash = $2, updated_at = now() where id = $3',
      [salt, pinHash, user.id]
    );
    await exec(
      'delete from exam_progress where user_id = $1',
      [user.id]
    );
  });
  return { id: user.id, nickname: user.nickname };
}

async function verifyPin(user, pin) {
  if (!user) return false;
  var candidate = await hashPin(pin, user.pin_salt);
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(user.pin_hash, 'hex'));
}

module.exports = {
  ensureAccountTables,
  withSchemaFallback,
  normalizeNickname,
  isValidPin,
  findUserByNickname,
  createUser,
  resetUserPinAndProgress,
  verifyPin
};
