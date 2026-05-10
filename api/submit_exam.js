const { getSession, readBody } = require('./_auth');
const { transaction } = require('./_db');
const { getAnswer, isAllowedPublicSet, publicSetMeta } = require('./_exam_sets');

/*
 * 속도 최적화 옵션
 *
 * SAVE_ATTEMPT_LOG:
 * - true  : exam_attempts에 응시 원자료 1건 저장
 * - false : 채점 속도를 위해 exam_attempts 저장 생략
 *
 * SAVE_EXAM_ANSWERS:
 * - true  : exam_answers에 문항별 답안 저장
 * - false : 채점 속도를 위해 문항별 답안 저장 생략
 *
 * 현재 목표는 사용자 채점 체감속도 개선이므로 둘 다 false로 둔다.
 * 오답노트는 exam_progress.answers + __question_ids 기반으로 유지된다.
 */
const SAVE_ATTEMPT_LOG = false;
const SAVE_EXAM_ANSWERS = false;

async function updatePrecomputedStats(tx, session, setId, score, correct, total, timings) {
  if (!session || !session.user_id || !session.name) return;

  const userId = session.user_id;
  const nickname = session.name;

  const tSetStats = Date.now();

  await tx.exec(
    `
    insert into exam_user_set_stats (
      user_id,
      nickname,
      set_id,
      attempts,
      total_score,
      avg_score,
      best_score,
      latest_score,
      latest_correct_count,
      latest_total_count,
      latest_at,
      updated_at
    )
    values (
      $1,
      $2,
      $3,
      1,
      $4,
      $4,
      $4,
      $4,
      $5,
      $6,
      now(),
      now()
    )
    on conflict (user_id, set_id)
    do update set
      nickname = excluded.nickname,
      attempts = exam_user_set_stats.attempts + 1,
      total_score = exam_user_set_stats.total_score + excluded.total_score,
      avg_score = round(
        (exam_user_set_stats.total_score + excluded.total_score)::numeric /
        (exam_user_set_stats.attempts + 1)
      )::integer,
      best_score = greatest(exam_user_set_stats.best_score, excluded.best_score),
      latest_score = excluded.latest_score,
      latest_correct_count = excluded.latest_correct_count,
      latest_total_count = excluded.latest_total_count,
      latest_at = now(),
      updated_at = now()
    `,
    userId,
    nickname,
    setId,
    score,
    correct,
    total
  );

  if (timings) {
    timings.db_user_set_stats_upsert_ms = Date.now() - tSetStats;
  }

  const tUserStats = Date.now();

  await tx.exec(
    `
    insert into exam_user_stats (
      user_id,
      nickname,
      attempts,
      total_score,
      avg_score,
      best_score,
      completed_sets,
      last_attempt_at,
      updated_at
    )
    select
      user_id,
      max(nickname),
      coalesce(sum(attempts), 0)::integer,
      coalesce(sum(total_score), 0)::integer,
      case
        when coalesce(sum(attempts), 0) > 0
        then round(sum(total_score)::numeric / sum(attempts))::integer
        else 0
      end,
      coalesce(max(best_score), 0)::integer,
      count(*)::integer,
      max(latest_at),
      now()
    from exam_user_set_stats
    where user_id = $1
    group by user_id
    on conflict (user_id)
    do update set
      nickname = excluded.nickname,
      attempts = excluded.attempts,
      total_score = excluded.total_score,
      avg_score = excluded.avg_score,
      best_score = excluded.best_score,
      completed_sets = excluded.completed_sets,
      last_attempt_at = excluded.last_attempt_at,
      updated_at = now()
    `,
    userId
  );

  if (timings) {
    timings.db_user_stats_upsert_ms = Date.now() - tUserStats;
  }
}

async function saveAttemptStats(
  session,
  setId,
  score,
  correct,
  total,
  results,
  startedAt,
  answers,
  questionIds,
  timings
) {
  const user = session.name;

  try {
    const tTransaction = Date.now();

    const txResult = await transaction(async function(tx) {
      let attemptId = null;

      if (SAVE_ATTEMPT_LOG) {
        const meta = publicSetMeta(setId);
        const tAttempt = Date.now();

        const attemptRows = await tx.query(
          'insert into exam_attempts ' +
            '(nickname, set_id, provider, chapter, score, correct_count, wrong_count, total_count, started_at, finished_at) ' +
            'values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now()) returning id',
          user,
          setId,
          meta.provider,
          meta.chapter,
          score,
          correct,
          total - correct,
          total,
          startedAt || null
        ).collect();

        attemptId = attemptRows[0] && attemptRows[0].id;

        if (timings) {
          timings.db_attempt_insert_ms = Date.now() - tAttempt;
          timings.db_attempt_insert_skipped = false;
        }
      } else if (timings) {
        timings.db_attempt_insert_ms = 0;
        timings.db_attempt_insert_skipped = true;
      }

      if (SAVE_EXAM_ANSWERS && results.length > 0 && attemptId) {
        const tAnswers = Date.now();
        const params = [];

        const values = results.map(function(r, idx) {
          const base = idx * 7;

          params.push(
            attemptId,
            user,
            setId,
            r.id,
            r.my_answer,
            r.correct_answer,
            r.is_correct
          );

          return (
            '($' + (base + 1) +
            ', $' + (base + 2) +
            ', $' + (base + 3) +
            ', $' + (base + 4) +
            ', $' + (base + 5) +
            ', $' + (base + 6) +
            ', $' + (base + 7) +
            ')'
          );
        }).join(', ');

        await tx.exec(
          'insert into exam_answers ' +
            '(attempt_id, nickname, set_id, question_id, my_answer, correct_answer, is_correct) ' +
            'values ' + values,
          ...params
        );

        if (timings) {
          timings.db_answers_insert_ms = Date.now() - tAnswers;
          timings.db_answers_insert_skipped = false;
        }
      } else if (timings) {
        timings.db_answers_insert_ms = 0;
        timings.db_answers_insert_skipped = true;
      }

      if (session.user_id) {
        const storedAnswers = Object.assign({}, answers || {});
        storedAnswers.__question_ids = questionIds || [];

        const tProgress = Date.now();

        await tx.exec(
          'insert into exam_progress ' +
            '(user_id, nickname, set_id, answers, graded, started_at, saved_at) ' +
            'values ($1, $2, $3, $4::jsonb, true, $5, now()) ' +
            'on conflict (user_id, set_id) do update set ' +
            'answers = excluded.answers, ' +
            'graded = true, ' +
            'started_at = coalesce(excluded.started_at, exam_progress.started_at), ' +
            'saved_at = now()',
          session.user_id,
          user,
          setId,
          JSON.stringify(storedAnswers),
          startedAt || null
        );

        if (timings) {
          timings.db_progress_upsert_ms = Date.now() - tProgress;
        }

        const tPrecomputed = Date.now();

        await updatePrecomputedStats(
          tx,
          session,
          setId,
          score,
          correct,
          total,
          timings
        );

        if (timings) {
          timings.db_precomputed_stats_total_ms = Date.now() - tPrecomputed;
        }
      }

      return true;
    });

    if (timings) {
      timings.db_transaction_total_ms = Date.now() - tTransaction;
    }

    return txResult === true;
  } catch (err) {
    console.error('submit_exam saveAttemptStats failed:', err);

    if (timings) {
      timings.save_error = String((err && err.message) || err);
    }

    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const serverStart = Date.now();
  const timings = {};

  const session = getSession(req);

  if (!session || !session.name) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const tBody = Date.now();

    const body = await readBody(req);
    const payload = JSON.parse(body);

    timings.read_body_ms = Date.now() - tBody;

    const set_id = payload.set_id || '';
    const answers = payload.answers || {};
    const questionIds = Array.isArray(payload.question_ids)
      ? payload.question_ids
      : Object.keys(answers);
    const startedAt = payload.started_at || null;

    if (!isAllowedPublicSet(set_id)) {
      res.status(400).json({ ok: false, error: '유효하지 않은 세트입니다.' });
      return;
    }

    let correct = 0;
    let total = questionIds.length;
    const results = [];

    const tGrade = Date.now();

    questionIds.forEach(function(q_id) {
      const answerInfo = getAnswer(q_id);
      if (!answerInfo) return;

      const ans_data = answerInfo.answer;
      const my_ans = answers[q_id] != null ? parseInt(answers[q_id], 10) : null;
      const correct_a = parseInt(ans_data.answer, 10);
      const is_ok = my_ans === correct_a;

      if (is_ok) correct++;

      results.push({
        id: q_id,
        is_correct: is_ok,
        my_answer: my_ans,
        correct_answer: correct_a,
        explanation: ans_data.explanation || '',
        option_rationale: ans_data.option_rationale || {},
        provider: answerInfo.provider,
        chapter: answerInfo.chapter,
        source_set: answerInfo.source_set
      });
    });

    timings.grading_loop_ms = Date.now() - tGrade;

    total = results.length;

    const score = total > 0 ? Math.round((correct / total) * 100) : 0;

    const tSave = Date.now();

    const statsSaved = await saveAttemptStats(
      session,
      set_id,
      score,
      correct,
      total,
      results,
      startedAt,
      answers,
      questionIds,
      timings
    );

    timings.save_attempt_stats_ms = Date.now() - tSave;
    timings.server_total_ms = Date.now() - serverStart;

    res.json({
      ok: true,
      score: score,
      correct: correct,
      wrong: total - correct,
      total: total,
      results: results,
      stats_saved: statsSaved,
      attempt_log_saved: SAVE_ATTEMPT_LOG,
      answer_detail_saved: SAVE_EXAM_ANSWERS,
      debug_timings: timings
    });
  } catch (err) {
    console.error('submit_exam handler failed:', err);

    timings.server_total_ms = Date.now() - serverStart;
    timings.handler_error = String((err && err.message) || err);

    res.status(500).json({
      ok: false,
      error: '시험 제출 처리 중 오류가 발생했습니다.',
      debug_timings: timings
    });
  }
};