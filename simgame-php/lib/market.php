<?php
// 샘플(DEMO) 시장 데이터 엔진 (PHP판).
// 실제 시세가 아니라 서버 비밀 시드로 만든 "가상 가격"이다.
// 공유 호스팅은 요청마다 PHP가 새로 시작되므로, 과거 가격을 누적 계산하지 않고
// "시간만 넣으면 바로 계산되는" 함수(여러 주기의 사인파 합 + 해시 노이즈)로 가격을 만든다.
if (!defined('SIMGAME')) { http_response_code(403); exit; }

final class Market {
    public const TICKERS = [
        '005930' => ['name' => '삼성전자', 'base' => 70000, 'volFactor' => 0.9, 'baseVolume' => 120000, 'sector' => '반도체·전자',
            'info' => '반도체, 스마트폰, 가전 등을 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다)'],
        '000660' => ['name' => 'SK하이닉스', 'base' => 180000, 'volFactor' => 1.2, 'baseVolume' => 30000, 'sector' => '반도체',
            'info' => '메모리 반도체를 주로 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다)'],
        '005380' => ['name' => '현대차', 'base' => 240000, 'volFactor' => 0.85, 'baseVolume' => 12000, 'sector' => '자동차',
            'info' => '자동차를 설계·생산·판매하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다)'],
        '035420' => ['name' => 'NAVER', 'base' => 200000, 'volFactor' => 1.0, 'baseVolume' => 18000, 'sector' => '인터넷·플랫폼',
            'info' => '검색, 커머스, 콘텐츠 등 온라인 서비스를 운영하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다)'],
        '035720' => ['name' => '카카오', 'base' => 50000, 'volFactor' => 1.25, 'baseVolume' => 60000, 'sector' => '인터넷·플랫폼',
            'info' => '메신저를 바탕으로 여러 온라인 서비스를 운영하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다)'],
        '373220' => ['name' => 'LG에너지솔루션', 'base' => 400000, 'volFactor' => 1.1, 'baseVolume' => 4000, 'sector' => '2차전지',
            'info' => '배터리를 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다)'],
        '068270' => ['name' => '셀트리온', 'base' => 180000, 'volFactor' => 1.15, 'baseVolume' => 15000, 'sector' => '바이오',
            'info' => '바이오 의약품을 개발·생산하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다)'],
    ];
    public const RANGES = [
        '1d' => [5, 288], '1w' => [60, 168], '1m' => [1440, 30], '3m' => [1440, 90],
    ];
    // 주의: PHP는 '373220' 같은 숫자 문자열 키를 정수로 바꾼다. 종목 코드는 항상 이 함수로 문자열로 꺼낼 것.
    public static function tickerList(): array { return array_map('strval', array_keys(self::TICKERS)); }

    private const MIN_MS = 60000;
    private const DAY_MIN = 1440;
    private const KST_OFFSET_MIN = 540;
    private const COMPONENTS = 14;

    private int $seed;
    private float $volatility;
    private array $comps = [];

    public function __construct(int $seed, float $volatility = 1.0) {
        $this->seed = $seed & 0xFFFFFFFF;
        $this->volatility = $volatility;
    }

    // ---- 32비트 해시 난수 ----
    private static function imul(int $a, int $b): int {
        $a &= 0xFFFFFFFF; $b &= 0xFFFFFFFF;
        return (($a & 0xFFFF) * $b + ((((($a >> 16) & 0xFFFF) * $b) & 0xFFFF) << 16)) & 0xFFFFFFFF;
    }
    private static function rnd(int $seed, int $i): float {
        $t = ($seed ^ self::imul($i & 0xFFFFFFFF, 0x9E3779B1)) & 0xFFFFFFFF;
        $t = self::imul($t ^ ($t >> 15), $t | 1);
        $t ^= ($t + self::imul($t ^ ($t >> 7), $t | 61)) & 0xFFFFFFFF;
        $t &= 0xFFFFFFFF;
        return (($t ^ ($t >> 14)) & 0xFFFFFFFF) / 4294967296.0;
    }
    private static function strHash(string $s): int {
        $h = 2166136261;
        for ($i = 0, $n = strlen($s); $i < $n; $i++) {
            $h = self::imul($h ^ ord($s[$i]), 16777619);
        }
        return $h;
    }
    private function tSeed(string $ticker): int {
        return ($this->seed ^ self::strHash($ticker)) & 0xFFFFFFFF;
    }

    public static function roundTick(float $p): int {
        $tick = $p < 2000 ? 1 : ($p < 5000 ? 5 : ($p < 20000 ? 10 : ($p < 50000 ? 50 : ($p < 200000 ? 100 : ($p < 500000 ? 500 : 1000)))));
        return (int)max($tick, round($p / $tick) * $tick);
    }
    private static function kstDayStartMin(int $m): int {
        return intdiv($m + self::KST_OFFSET_MIN, self::DAY_MIN) * self::DAY_MIN - self::KST_OFFSET_MIN;
    }

    // 종목별 사인파 성분: [진폭, 각주파수(1/분), 위상]
    private function components(string $ticker): array {
        if (isset($this->comps[$ticker])) return $this->comps[$ticker];
        $meta = self::TICKERS[$ticker];
        $sd = $this->tSeed($ticker);
        $list = [];
        $minP = 25.0; $maxP = 64800.0;
        for ($k = 0; $k < self::COMPONENTS; $k++) {
            $period = $minP * pow($maxP / $minP, $k / (self::COMPONENTS - 1));
            $period *= 0.85 + 0.3 * self::rnd($sd ^ 0xA5A5A5A5, $k);
            $amp = 0.0011 * pow($period, 0.34) * (0.6 + 0.8 * self::rnd($sd ^ 0x5A5A5A5A, $k + 100));
            $amp *= $meta['volFactor'] * $this->volatility;
            $phase = 2 * M_PI * self::rnd($sd ^ 0x3C3C3C3C, $k + 200);
            $list[] = [$amp, 2 * M_PI / $period, $phase];
        }
        return $this->comps[$ticker] = $list;
    }

    private function smoothLog(string $ticker, float $minutes): float {
        $x = 0.0;
        foreach ($this->components($ticker) as [$a, $w, $ph]) {
            $x += $a * sin($w * $minutes + $ph);
        }
        return $x;
    }

    private function minutePrice(string $ticker, int $minute): int {
        $meta = self::TICKERS[$ticker];
        $noise = (self::rnd($this->tSeed($ticker) ^ 0x2F2F2F2F, $minute) - 0.5) * 0.0010 * $meta['volFactor'] * $this->volatility;
        return self::roundTick($meta['base'] * exp($this->smoothLog($ticker, (float)$minute) + $noise));
    }

    public function priceAt(string $ticker, int $ms): int {
        $meta = self::TICKERS[$ticker];
        $smooth = $this->smoothLog($ticker, $ms / self::MIN_MS);
        $jitter = (self::rnd($this->tSeed($ticker) ^ 0x5BD1E995, intdiv($ms, 10000)) - 0.5) * 0.0008 * $meta['volFactor'] * $this->volatility;
        return self::roundTick($meta['base'] * exp($smooth + $jitter));
    }

    private function minuteVolume(string $ticker, int $minute): int {
        $meta = self::TICKERS[$ticker];
        $shape = 0.6 + 0.8 * self::rnd($this->tSeed($ticker) ^ 0x1234567, $minute);
        return (int)max(1, round(($meta['baseVolume'] / self::DAY_MIN) * $shape * 2));
    }

    public function prevClose(string $ticker, int $ms): int {
        return $this->minutePrice($ticker, self::kstDayStartMin(intdiv($ms, self::MIN_MS)));
    }

    public function todayVolume(string $ticker, int $ms): int {
        $m = intdiv($ms, self::MIN_MS);
        $v = 0;
        for ($i = self::kstDayStartMin($m); $i <= $m; $i++) $v += $this->minuteVolume($ticker, $i);
        return $v;
    }

    public function candles(string $ticker, string $range, int $ms): ?array {
        if (!isset(self::RANGES[$range])) return null;
        [$bucketMin, $count] = self::RANGES[$range];
        $nowMin = intdiv($ms, self::MIN_MS);
        $align = $bucketMin === self::DAY_MIN ? self::kstDayStartMin($nowMin) : intdiv($nowMin, $bucketMin) * $bucketMin;
        $step = $bucketMin >= self::DAY_MIN ? 5 : 1; // 긴 기간은 5분 간격으로 표본 추출(속도)
        $out = [];
        for ($b = $align - ($count - 1) * $bucketMin; $b <= $align; $b += $bucketMin) {
            $last = min($b + $bucketMin - 1, $nowMin);
            $o = 0; $h = 0; $l = PHP_INT_MAX; $c = 0; $v = 0;
            for ($m = $b; $m <= $last; $m += $step) {
                $p = $this->minutePrice($ticker, $m);
                if ($m === $b) $o = $p;
                if ($p > $h) $h = $p;
                if ($p < $l) $l = $p;
                $c = $p;
                $v += $this->minuteVolume($ticker, $m) * $step;
            }
            if ($last === $nowMin) { // 진행 중인 마지막 캔들은 현재가로 마감
                $c = $this->priceAt($ticker, $ms);
                $h = max($h, $c);
                $l = min($l, $c);
            }
            if ($o === 0) $o = $c;
            $out[] = ['t' => $b * self::MIN_MS, 'o' => $o, 'h' => $h, 'l' => $l, 'c' => $c, 'v' => $v];
        }
        return $out;
    }
}
