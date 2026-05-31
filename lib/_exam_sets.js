const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CHAPTERS = {
  ch1: '1장 재난의 이해',
  ch2: '2장 재난의 분류',
  ch3: '3장 재난관리단계',
  ch4: '4장 재난관리 계획',
  ch5: '5장 재난관리 행정체계 및 조직의 변천',
  ch6: '6장 미래 재난 관리',
  ch7: '7장 재난관리 핵심 교과목',
  ch8: '8장 다학제적 접근',
  ch9: '9장 재난 및 안전관리 기본법'
};
const SOURCE_SETS_BY_CHAPTER = {
  ch1: ['gemini_ch1', 'gpt_ch1'],
  ch2: ['gemini_ch2', 'gpt_ch2'],
  ch3: ['gemini_ch3', 'gpt_ch3'],
  ch4: ['gemini_ch4', 'gpt_ch4'],
  ch5: ['gemini_ch5', 'gpt_ch5'],
  ch6: ['gemini_ch6', 'gpt_ch6'],
  ch7: ['gemini_ch7', 'gpt_ch7'],
  ch8: ['gemini_ch8', 'gpt_ch8'],
  ch9: ['gemini_ch9', 'gpt_ch9']
};
const SOURCE_SET_LABELS = {
  gemini_ch1: 'Gemini · 1장 재난의 이해',
  gemini_ch2: 'Gemini · 2장 재난의 분류',
  gemini_ch3: 'Gemini · 3장 재난관리단계',
  gemini_ch4: 'Gemini · 4장 재난관리 계획',
  gemini_ch5: 'Gemini · 5장 재난관리 행정체계 및 조직의 변천',
  gemini_ch6: 'Gemini · 6장 미래 재난 관리',
  gemini_ch7: 'Gemini · 7장 재난관리 핵심 교과목',
  gemini_ch8: 'Gemini · 8장 다학제적 접근',
  gemini_ch9: 'Gemini · 9장 재난 및 안전관리 기본법',
  gpt_ch1: 'ChatGPT · 1장 재난의 이해',
  gpt_ch2: 'ChatGPT · 2장 재난의 분류',
  gpt_ch3: 'ChatGPT · 3장 재난관리단계',
  gpt_ch4: 'ChatGPT · 4장 재난관리 계획',
  gpt_ch5: 'ChatGPT · 5장 재난관리 행정체계 및 조직의 변천',
  gpt_ch6: 'ChatGPT · 6장 미래 재난 관리',
  gpt_ch7: 'ChatGPT · 7장 재난관리 핵심 교과목',
  gpt_ch8: 'ChatGPT · 8장 다학제적 접근',
  gpt_ch9: 'ChatGPT · 9장 재난 및 안전관리 기본법'
};
const ALL_EXAM_DISTRIBUTION = {
  ch1: 11,
  ch2: 11,
  ch3: 11,
  ch4: 11,
  ch5: 11,
  ch6: 11,
  ch7: 11,
  ch8: 11,
  ch9: 12
};
const PUBLIC_SETS = Object.keys(SOURCE_SET_LABELS).concat(Object.keys(CHAPTERS), ['all']);
const sourceCache = {};
const poolCache = {};
const questionIdPoolCache = {};
let questionIndex = null;
let answerIndex = null;

function isAllowedPublicSet(setId) {
  return PUBLIC_SETS.indexOf(setId) >= 0;
}

function parseQuestionId(questionId) {
  var match = String(questionId || '').match(/^(gemini|gpt)_(ch(?:1|2|3|4|5|6|7|8|9))_/);
  if (!match) return null;
  return {
    provider: match[1],
    chapter: match[2],
    source_set: match[1] + '_' + match[2]
  };
}

function sourceSetsForPublicSet(setId) {
  if (SOURCE_SET_LABELS[setId]) return [setId];
  if (setId === 'all') {
    return Object.keys(CHAPTERS).flatMap(function(chapter) {
      return SOURCE_SETS_BY_CHAPTER[chapter] || [];
    });
  }
  if (!CHAPTERS[setId]) return [];
  return SOURCE_SETS_BY_CHAPTER[setId] || [];
}

function readSource(sourceSet) {
  if (sourceCache[sourceSet]) return sourceCache[sourceSet];
  var filePath = path.join(__dirname, '..', 'api', 'data', 'sources', sourceSet + '.json');
  sourceCache[sourceSet] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return sourceCache[sourceSet];
}

function optionText(raw, index) {
  return String(raw || '').replace(new RegExp('^\\s*' + (index + 1) + '[.)]\\s*'), '');
}

function normalizeQuestionText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeQuestion(raw, sourceSet) {
  var meta = parseQuestionId(sourceSet + '_' + String(raw['문항번호']).padStart(3, '0'));
  var id = sourceSet + '_' + String(raw['문항번호']).padStart(3, '0');
  return {
    id: id,
    question_no: raw['문항번호'],
    question_text: raw['본문'] || '',
    difficulty: raw['예상난이도'] || '',
    options: (raw['선택지'] || []).map(function(text, idx) {
      return { no: idx + 1, text: optionText(text, idx) };
    }),
    provider: meta.provider,
    chapter: meta.chapter,
    source_set: meta.source_set
  };
}

function getQuestionPool(chapter) {
  if (poolCache[chapter]) return poolCache[chapter];
  var sourceSets = sourceSetsForPublicSet(chapter);
  var pool = [];
  var ids = [];
  sourceSets.forEach(function(sourceSet) {
    var questions = readSource(sourceSet);
    questions.forEach(function(question) {
      var normalized = normalizeQuestion(question, sourceSet);
      pool.push(normalized);
      ids.push(normalized.id);
    });
  });
  poolCache[chapter] = pool;
  questionIdPoolCache[chapter] = ids;
  return poolCache[chapter];
}

function getQuestionIdPool(chapter) {
  if (questionIdPoolCache[chapter]) return questionIdPoolCache[chapter];
  getQuestionPool(chapter);
  return questionIdPoolCache[chapter] || [];
}

function pickRandom(items, count) {
  if (!Array.isArray(items) || count <= 0) return [];
  if (items.length <= count) return items.slice();

  var arr = items.slice();
  for (var i = 0; i < count; i++) {
    var j = crypto.randomInt(i, arr.length);
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr.slice(0, count);
}

function pickRandomUniqueQuestionIds(items, count, seenTexts) {
  if (!Array.isArray(items) || count <= 0) return [];
  var arr = items.slice();
  var selected = [];
  var textSet = seenTexts || new Set();
  var questionIndex = getQuestionIndex();

  for (var i = 0; i < arr.length && selected.length < count; i++) {
    var j = crypto.randomInt(i, arr.length);
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;

    var question = questionIndex[arr[i]];
    if (!question) continue;
    var textKey = normalizeQuestionText(question.question_text);
    if (textSet.has(textKey)) continue;
    textSet.add(textKey);
    selected.push(arr[i]);
  }

  return selected;
}

function selectQuestions(setId) {
  if (SOURCE_SET_LABELS[setId]) {
    return getQuestionPool(setId);
  }

  var seenTexts = new Set();
  if (setId === 'all') {
    var selectedIds = Object.keys(CHAPTERS).flatMap(function(chapter) {
      return pickRandomUniqueQuestionIds(
        getQuestionIdPool(chapter),
        ALL_EXAM_DISTRIBUTION[chapter] || 0,
        seenTexts
      );
    });
    return getQuestionsByIds(selectedIds);
  }
  return getQuestionsByIds(pickRandomUniqueQuestionIds(getQuestionIdPool(setId), 20, seenTexts));
}

function getQuestionsByIds(questionIds) {
  var index = getQuestionIndex();
  return (questionIds || []).map(function(id) { return index[id]; }).filter(Boolean);
}

function normalizeAnswer(raw, meta) {
  return {
    provider: meta.provider,
    chapter: meta.chapter,
    source_set: meta.source_set,
    answer: {
      answer: raw['정답'],
      explanation: raw['문제해설'] || '',
      option_rationale: raw['선택지_근거'] || {}
    }
  };
}

function getQuestionIndex() {
  if (questionIndex) return questionIndex;
  questionIndex = {};
  Object.keys(CHAPTERS).forEach(function(chapter) {
    getQuestionPool(chapter).forEach(function(question) {
      questionIndex[question.id] = question;
    });
  });
  return questionIndex;
}

function getAnswerIndex() {
  if (answerIndex) return answerIndex;
  answerIndex = {};
  Object.keys(CHAPTERS).forEach(function(chapter) {
    (SOURCE_SETS_BY_CHAPTER[chapter] || []).forEach(function(sourceSet) {
      readSource(sourceSet).forEach(function(raw) {
        var id = sourceSet + '_' + String(raw['문항번호']).padStart(3, '0');
        var meta = parseQuestionId(id);
        if (meta) answerIndex[id] = normalizeAnswer(raw, meta);
      });
    });
  });
  return answerIndex;
}

function getAnswer(questionId) {
  return getAnswerIndex()[questionId] || null;
}

function publicSetMeta(setId) {
  var parsed = parseQuestionId(setId + '_001');
  if (parsed && SOURCE_SET_LABELS[setId]) {
    return { provider: parsed.provider, chapter: parsed.chapter, title: SOURCE_SET_LABELS[setId] };
  }

  if (setId === 'all') {
    return { provider: 'mixed', chapter: 'all', title: '전체 과목 모의고사' };
  }
  return { provider: 'mixed', chapter: setId, title: CHAPTERS[setId] || setId };
}

module.exports = {
  CHAPTERS,
  SOURCE_SETS_BY_CHAPTER,
  SOURCE_SET_LABELS,
  ALL_EXAM_DISTRIBUTION,
  PUBLIC_SETS,
  isAllowedPublicSet,
  parseQuestionId,
  selectQuestions,
  getQuestionsByIds,
  getAnswer,
  publicSetMeta
};
