const { getUser, readBody } = require('./_auth');
const { getAnswer, getQuestionsByIds, isAllowedPublicSet } = require('./_exam_sets');

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

  var payload = JSON.parse(await readBody(req));
  var setId = payload.set_id || '';
  var answers = payload.answers || {};
  var questionIds = Array.isArray(payload.question_ids) ? payload.question_ids : Object.keys(answers);
  var includeQuestions = !!payload.include_questions;

  if (!isAllowedPublicSet(setId)) {
    res.status(400).json({ ok: false, error: '유효하지 않은 세트입니다.' });
    return;
  }

  var correct = 0;
  var results = [];

  questionIds.forEach(function(qId) {
    var answerInfo = getAnswer(qId);
    if (!answerInfo) return;
    var ansData = answerInfo.answer;
    var myAns = answers[qId] != null ? parseInt(answers[qId], 10) : null;
    var correctAns = parseInt(ansData.answer, 10);
    var isCorrect = myAns === correctAns;
    if (isCorrect) correct++;
    results.push({
      id: qId,
      is_correct: isCorrect,
      my_answer: myAns,
      correct_answer: correctAns,
      explanation: ansData.explanation || '',
      option_rationale: ansData.option_rationale || {}
    });
  });

  var total = results.length;
  var score = total > 0 ? Math.round(correct / total * 100) : 0;
  var response = { ok: true, score: score, correct: correct, wrong: total - correct, total: total, results: results };
  if (includeQuestions) response.questions = getQuestionsByIds(questionIds);
  res.json(response);
};
