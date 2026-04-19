<?php
require_once __DIR__ . '/_session.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_auth();

$allowed_sets = array(
    'gemini_ch1', 'gemini_ch2', 'gemini_ch3',
    'gpt_ch1',    'gpt_ch2',    'gpt_ch3',
);

$set_id = isset($_GET['set']) ? $_GET['set'] : '';

if (!in_array($set_id, $allowed_sets, true)) {
    header('HTTP/1.1 400 Bad Request');
    echo json_encode(array('ok' => false, 'error' => '유효하지 않은 세트입니다.'));
    exit;
}

$path = QUESTIONS_DIR . $set_id . '.json';

if (!file_exists($path)) {
    header('HTTP/1.1 404 Not Found');
    echo json_encode(array('ok' => false, 'error' => '문제 파일을 찾을 수 없습니다.'));
    exit;
}

$questions = json_decode(file_get_contents($path), true);

echo json_encode(array('ok' => true, 'questions' => $questions));
