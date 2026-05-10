const { exec } = require('./_db');

function isAllowed(req) {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token') || '';
  const expected = process.env.SETUP_STATS_TOKEN || '';

  /*
   * 로컬 개발 환경에서는 SETUP_STATS_TOKEN이 없어도
   * token=local-dev 로 실행할 수 있게 한다.
   * 운영 배포 환경에서는 반드시 SETUP_STATS_TOKEN을 설정해야 한다.
   */
  if (!expected && process.env.NODE_ENV !== 'production') {
    return token === 'local-dev';
  }

  if (!expected) return false;

  return token === expected;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (!isAllowed(req)) {
    res.status(403).json({
      ok: false,
      error: 'forbidden'
    });
    return;
  }

  const started = Date.now();
  const steps = [];

  async function run(name, sql) {
    const t = Date.now();
    await exec(sql, []);
    steps.push({
      name: name,
      ms: Date.now() - t
    });
  }

  try {
    await run(
      'create_exam_user_stats',
      'create table if not exists exam_user_stats (' +
        'user_id text primary key references exam_users(id) on delete cascade, ' +
        'nickname text not null unique, ' +
        'attempts integer not null default 0, ' +
        'total_score integer not null default 0, ' +
        'avg_score integer not null default 0, ' +
        'best_score integer not null default 0, ' +
        'completed_sets integer not null default 0, ' +
        'last_attempt_at timestamptz, ' +
        'updated_at timestamptz not null default now()' +
      ')'
    );

    await run(
      'idx_exam_user_stats_updated_at',
      'create index if not exists idx_exam_user_stats_updated_at ' +
        'on exam_user_stats(updated_at desc)'
    );

    await run(
      'create_exam_user_set_stats',
      'create table if not exists exam_user_set_stats (' +
        'user_id text not null references exam_users(id) on delete cascade, ' +
        'nickname text not null, ' +
        'set_id text not null, ' +
        'attempts integer not null default 0, ' +
        'total_score integer not null default 0, ' +
        'avg_score integer not null default 0, ' +
        'best_score integer not null default 0, ' +
        'latest_score integer, ' +
        'latest_correct_count integer, ' +
        'latest_total_count integer, ' +
        'latest_at timestamptz, ' +
        'updated_at timestamptz not null default now(), ' +
        'primary key (user_id, set_id)' +
      ')'
    );

    await run(
      'idx_exam_user_set_stats_nickname',
      'create index if not exists idx_exam_user_set_stats_nickname ' +
        'on exam_user_set_stats(nickname)'
    );

    await run(
      'idx_exam_user_set_stats_nickname_set',
      'create index if not exists idx_exam_user_set_stats_nickname_set ' +
        'on exam_user_set_stats(nickname, set_id)'
    );

    await run(
      'idx_exam_user_set_stats_set_id',
      'create index if not exists idx_exam_user_set_stats_set_id ' +
        'on exam_user_set_stats(set_id)'
    );

    await run(
      'idx_exam_user_set_stats_leaderboard',
      'create index if not exists idx_exam_user_set_stats_leaderboard ' +
        'on exam_user_set_stats(nickname, best_score desc)'
    );

    /*
     * 현재는 submit_exam.js에서 exam_attempts와 exam_answers 저장을 꺼둔 상태다.
     * 하지만 기존 데이터나 향후 관리자 통계를 위해 인덱스는 setup에서만 확인한다.
     */
    await run(
      'idx_exam_attempts_nickname_optional',
      'create index if not exists idx_exam_attempts_nickname on exam_attempts(nickname)'
    ).catch(function() {
      steps.push({
        name: 'idx_exam_attempts_nickname_optional',
        skipped: true,
        reason: 'exam_attempts table missing'
      });
    });

    await run(
      'idx_exam_attempts_nickname_set_finished_optional',
      'create index if not exists idx_exam_attempts_nickname_set_finished ' +
        'on exam_attempts(nickname, set_id, finished_at desc)'
    ).catch(function() {
      steps.push({
        name: 'idx_exam_attempts_nickname_set_finished_optional',
        skipped: true,
        reason: 'exam_attempts table missing'
      });
    });

    await run(
      'idx_exam_answers_attempt_optional',
      'create index if not exists idx_exam_answers_attempt on exam_answers(attempt_id)'
    ).catch(function() {
      steps.push({
        name: 'idx_exam_answers_attempt_optional',
        skipped: true,
        reason: 'exam_answers table missing'
      });
    });

    await run(
      'idx_exam_answers_set_question_optional',
      'create index if not exists idx_exam_answers_set_question on exam_answers(set_id, question_id)'
    ).catch(function() {
      steps.push({
        name: 'idx_exam_answers_set_question_optional',
        skipped: true,
        reason: 'exam_answers table missing'
      });
    });

    res.json({
      ok: true,
      message: 'stats schema ready',
      total_ms: Date.now() - started,
      steps: steps
    });
  } catch (err) {
    console.error('setup_stats_schema failed:', err);

    res.status(500).json({
      ok: false,
      error: 'stats schema setup failed',
      message: String((err && err.message) || err),
      total_ms: Date.now() - started,
      steps: steps
    });
  }
};