<?php
require_once __DIR__ . '/_session.php';
header('Content-Type: application/json; charset=utf-8');

if (!empty($_SESSION['authenticated'])) {
    echo json_encode(array('ok' => true, 'name' => $_SESSION['name']));
} else {
    echo json_encode(array('ok' => false));
}
