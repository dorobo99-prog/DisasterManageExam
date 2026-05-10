const crypto = require('crypto');
const { query, exec } = require('./_db');

let ready = false;

function needsSchemaBootstrap(err) {
  var msg = String((err && (err.code || err.message)) || err || '').toLowerCase();

  return (
    msg.indexOf('does not exist') >= 0 ||
    msg.indexOf('undefined_table') >= 0 ||
    msg.indexOf('42p01') >= 0
  );
}

async function execOptional(sql, params) {
  try {
    await exec(sql, params || []);
  } catch (err) {
    if (!needsSchemaBootstrap(err)) throw err;
  }
}

async function rebuildRankStats() {
  await execOptional(
    'delete from exam_user_rank_stats ' +
      'where user_id not in (' +
        'select distinct user_id from exam_user_set_stats where attempts > 0' +
      ')',
    []
  );

  await execOptional(
    `
    insert into exam_user_rank_stats (
      user_id,
      nickname,
      rank,
      total_users,
      avg_best_score,
      completed_sets,
      attempts,
      latest_at,
      updated_at
    )
    with user_scores as (
      select
        user_id,
        max(nickname) as nickname,
        round(avg(best_score))::integer as avg_best_score,
        count(*)::integer as completed_sets,
        sum(attempts)::integer as attempts,
        max(latest_at) as latest_at
      from exam_user_set_stats
      where attempts > 0
      group by user_id
    ),
    ranked as (
      select
        row_number() over (
          order by
            avg_best_score desc,
            completed_sets desc,
            attempts desc,
            nickname asc
        )::integer as rank,
        count(*) over ()::integer as total_users,
        user_id,
        nickname,
        avg_best_score,
        completed_sets,
        attempts,
        latest_at
      from user_scores
    )
    select
      user_id,
      nickname,
      rank,
      total_users,
      avg_best_score,
      completed_sets,
      attempts,
      latest_at,
      now()
    from ranked
    on conflict (user_id) do update set
      nickname = excluded.nickname,
      rank = excluded.rank,
      total_users = excluded.total_users,
      avg_best_score = excluded.avg_best_score,
      completed_sets = excluded.completed_sets,
      attempts = excluded.attempts,
      latest_at = excluded.latest_at,
      updated_at = now()
    `,
    []
  );
}

async function ensureAccountTables() {
  if (ready) return;

  await exec(
    'create table if not exists exam_users (' +
      'id text primary key, ' +
      'nickname text not null unique, ' +
      'pin_salt text not null, ' +
      'pin_hash text not null, ' +
      'created_at timestamptz not null default now(), ' +
      'updated_at timestamptz not null default now()' +
    ')',
    []
  );

  await exec(
    'create table if not exists exam_progress (' +
      'user_id text not null references exam_users(id) on delete cascade, ' +
      'nickname text not null, ' +
      'set_id text not null, ' +
      'answers jsonb not null default \'{}\'::jsonb, ' +
      'graded boolean not null default false, ' +
      'started_at timestamptz, ' +
      'saved_at timestamptz not null default now(), ' +
      'primary key (user_id, set_id)' +
    ')',
    []
  );

  await exec(
    'create index if not exists idx_exam_progress_nickname on exam_progress(nickname)',
    []
  );

  await exec(
    'create table if not exists exam_user_set_stats (' +
      'user_id text not null references exam_users(id) on delete cascade, ' +
      'nickname text not null, ' +
      'set_id text not null, ' +
      'attempts integer not null default 0, ' +
      'total_score integer not null default 0, ' +
      'avg_score integer not null default 0, ' +
      'best_score integer not null default 0, ' +
      'latest_score integer not null default 0, ' +
      'latest_correct_count integer not null default 0, ' +
      'latest_total_count integer not null default 0, ' +
      'latest_at timestamptz, ' +
      'updated_at timestamptz not null default now(), ' +
      'primary key (user_id, set_id)' +
    ')',
    []
  );

  await exec(
    'create index if not exists idx_exam_user_set_stats_set_id on exam_user_set_stats(set_id)',
    []
  );

  await exec(
    'create index if not exists idx_exam_user_set_stats_latest_at on exam_user_set_stats(latest_at desc)',
    []
  );

  await exec(
    'create table if not exists exam_user_stats (' +
      'user_id text primary key references exam_users(id) on delete cascade, ' +
      'nickname text not null, ' +
      'attempts integer not null default 0, ' +
      'total_score integer not null default 0, ' +
      'avg_score integer not null default 0, ' +
      'best_score integer not null default 0, ' +
      'completed_sets integer not null default 0, ' +
      'last_attempt_at timestamptz, ' +
      'updated_at timestamptz not null default now()' +
    ')',
    []
  );

  await exec(
    'create index if not exists idx_exam_user_stats_sort on exam_user_stats(avg_score desc, best_score desc, completed_sets desc, attempts desc, nickname asc)',
    []
  );

  await exec(
    'create table if not exists exam_user_rank_stats (' +
      'user_id text primary key references exam_users(id) on delete cascade, ' +
      'nickname text not null, ' +
      'rank integer not null, ' +
      'total_users integer not null, ' +
      'avg_best_score integer not null default 0, ' +
      'completed_sets integer not null default 0, ' +
      'attempts integer not null default 0, ' +
      'latest_at timestamptz, ' +
      'updated_at timestamptz not null default now()' +
    ')',
    []
  );

  await exec(
    'create index if not exists idx_exam_user_rank_stats_rank on exam_user_rank_stats(rank)',
    []
  );

  await exec(
    'create table if not exists exam_cache (' +
      'cache_key text primary key, ' +
      'payload jsonb not null, ' +
      'expires_at timestamptz not null, ' +
      'updated_at timestamptz not null default now()' +
    ')',
    []
  );

  await rebuildRankStats();

  ready = true;
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

    await execOptional(
      'delete from exam_user_set_stats where user_id = $1',
      [user.id]
    );

    await execOptional(
      'delete from exam_user_stats where user_id = $1',
      [user.id]
    );

    await execOptional(
      'delete from exam_user_rank_stats where user_id = $1',
      [user.id]
    );

    await rebuildRankStats();
  });

  return { id: user.id, nickname: user.nickname };
}

async function verifyPin(user, pin) {
  if (!user) return false;

  var candidate = await hashPin(pin, user.pin_salt);

  return crypto.timingSafeEqual(
    Buffer.from(candidate, 'hex'),
    Buffer.from(user.pin_hash, 'hex')
  );
}

module.exports = {
  ensureAccountTables,
  rebuildRankStats,
  withSchemaFallback,
  normalizeNickname,
  isValidPin,
  findUserByNickname,
  createUser,
  resetUserPinAndProgress,
  verifyPin
};
