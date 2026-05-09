const { getUser, readBody } = require('./_auth');
const { transaction } = require('./_db');
const fs   = require('fs');
const path = require('path');

const ALLOWED = ['gemini_ch1','gemini_ch2','gemini_ch3','gpt_ch1','gpt_ch2','gpt_ch3'];

function splitSetId(setId) {
  var parts = setId.split('_');
  return {
    provider: parts[0] || '',
    chapter: parts[1] || '',
  };
}

async function saveAttemptStats(user, setId, score, correct, total, results, startedAt) {
  var meta = splitSetId(setId);
  var saved = false;

  try {
    var txResult = await transaction(async function(tx) {
      var attemptRows = await tx.query(
        'insert into exam_attempts (nickname, set_id, provider, chapter, score, correct_count, wrong_count, total_count, started_at, finished_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now()) returning id',
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

      var attemptId = attemptRows[0] && attemptRows[0].id;
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        await tx.exec(
          'insert into exam_answers (attempt_id, nickname, set_id, question_id, my_answer, correct_answer, is_correct) values ($1, $2, $3, $4, $5, $6, $7)',
          attemptId,
          user,
          setId,
          r.id,
          r.my_answer,
          r.correct_answer,
          r.is_correct
        );
      }
      return true;
    });
    saved = txResult === true;
  } catch (err) {
    saved = false;
  }

  return saved;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  var user = getUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  var body    = await readBody(req);
  var payload = JSON.parse(body);
  var set_id  = payload.set_id  || '';
  var answers = payload.answers || {};
  var startedAt = payload.started_at || null;

  if (ALLOWED.indexOf(set_id) < 0) {
    res.status(400).json({ ok: false, error: '유효하지 않은 세트입니다.' });
    return;
  }

  var answerPath = path.join(__dirname, 'data', 'answers', set_id + '.json');
  if (!fs.existsSync(answerPath)) {
    res.status(500).json({ ok: false, error: '정답 파일을 찾을 수 없습니다.' });
    return;
  }

  var answerDb = JSON.parse(fs.readFileSync(answerPath, 'utf8'));
  var correct  = 0;
  var total    = Object.keys(answerDb).length;
  var results  = [];

  Object.keys(answerDb).forEach(function(q_id) {
    var ans_data  = answerDb[q_id];
    var my_ans    = answers[q_id] != null ? parseInt(answers[q_id], 10) : null;
    var correct_a = parseInt(ans_data.answer, 10);
    var is_ok     = (my_ans === correct_a);
    if (is_ok) correct++;
    results.push({
      id:               q_id,
      is_correct:       is_ok,
      my_answer:        my_ans,
      correct_answer:   correct_a,
      explanation:      ans_data.explanation      || '',
      option_rationale: ans_data.option_rationale || {}
    });
  });

  var score = total > 0 ? Math.round(correct / total * 100) : 0;
  var statsSaved = await saveAttemptStats(user, set_id, score, correct, total, results, startedAt);
  res.json({ ok: true, score: score, correct: correct, wrong: total - correct, total: total, results: results, stats_saved: statsSaved });
};
