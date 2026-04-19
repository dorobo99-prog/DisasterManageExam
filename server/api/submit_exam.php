<?php
require_once __DIR__ . '/_session.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_auth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('HTTP/1.1 405 Method Not Allowed');
    echo json_encode(array('ok' => false, 'error' => 'Method not allowed'));
    exit;
}

$allowed_sets = array(
    'gemini_ch1', 'gemini_ch2', 'gemini_ch3',
    'gpt_ch1',    'gpt_ch2',    'gpt_ch3',
);

$body    = json_decode(file_get_contents('php://input'), true);
$set_id  = isset($body['set_id'])  ? $body['set_id']  : '';
$answers = isset($body['answers']) ? $body['answers']  : array();

if (!in_array($set_id, $allowed_sets, true)) {
    header('HTTP/1.1 400 Bad Request');
    echo json_encode(array('ok' => false, 'error' => '유효하지 않은 세트입니다.'));
    exit;
}

$answer_path = ANSWERS_DIR . $set_id . '.json';
if (!file_exists($answer_path)) {
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode(array('ok' => false, 'error' => '정답 파일을 찾을 수 없습니다.'));
    exit;
}
$answer_db = json_decode(file_get_contents($answer_path), true);

$correct = 0;
$total   = count($answer_db);
$results = array();

foreach ($answer_db as $q_id => $ans_data) {
    $my_ans    = isset($answers[$q_id]) ? (int)$answers[$q_id] : null;
    $correct_a = (int)$ans_data['answer'];
    $is_ok     = ($my_ans === $correct_a);

    if ($is_ok) $correct++;

    $result = array(
        'id'             => $q_id,
        'is_correct'     => $is_ok,
        'my_answer'      => $my_ans,
        'correct_answer' => $correct_a,
        'explanation'    => isset($ans_data['explanation'])      ? $ans_data['explanation']      : '',
        'option_rationale' => isset($ans_data['option_rationale']) ? $ans_data['option_rationale'] : array(),
    );

    $results[] = $result;
}

$score = $total > 0 ? round($correct / $total * 100) : 0;

echo json_encode(array(
    'ok'      => true,
    'score'   => $score,
    'correct' => $correct,
    'wrong'   => $total - $correct,
    'total'   => $total,
    'results' => $results,
));
