const { getUser, readBody } = require('./_auth');
const fs   = require('fs');
const path = require('path');

const ALLOWED = ['gemini_ch1','gemini_ch2','gemini_ch3','gpt_ch1','gpt_ch2','gpt_ch3'];

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (!getUser(req)) {
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
  res.json({ ok: true, score: score, correct: correct, wrong: total - correct, total: total, results: results });
};
