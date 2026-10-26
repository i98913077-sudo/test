<?php
// 공통 유틸. 이 파일들은 api.php를 통해서만 실행된다.
if (!defined('SIMGAME')) { http_response_code(403); exit; }

class GameError extends Exception {
    public int $status;
    public function __construct(string $message, int $status = 400) {
        parent::__construct($message);
        $this->status = $status;
    }
}

function sim_now_ms(): int {
    return isset($GLOBALS['SIM_NOW']) ? (int)$GLOBALS['SIM_NOW'] : (int)floor(microtime(true) * 1000);
}
