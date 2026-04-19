<?php
// 비밀번호 SHA-256 해시 (DADEM)
define('EXAM_PASSWORD_HASH', '2e71608399786b6178faa3681a877f300ef0ac1f4c07a70775abaa6497899434');

// 세션 설정
define('SESSION_NAME',    'exam_session');
define('SESSION_EXPIRE',  60 * 60 * 8); // 8시간

// 데이터 경로 (이 파일 기준 상대경로)
define('QUESTIONS_DIR', __DIR__ . '/questions/');
define('ANSWERS_DIR',   __DIR__ . '/answers/');
