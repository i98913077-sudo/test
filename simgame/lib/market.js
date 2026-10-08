// 샘플(DEMO) 시장 데이터 엔진.
// 실제 시세가 아니라 서버 비밀 시드로 만든 "가상 가격"이다. 같은 시드면 항상 같은 가격이 나온다.
// 시드는 DB에 저장되므로 소스코드(공개 저장소)를 읽어도 미래 가격을 계산할 수 없다.

export const TICKERS = [
  { ticker: '005930', name: '삼성전자', base: 70000, volFactor: 0.9, baseVolume: 120000, sector: '반도체·전자',
    info: '반도체, 스마트폰, 가전 등을 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다)' },
  { ticker: '000660', name: 'SK하이닉스', base: 180000, volFactor: 1.2, baseVolume: 30000, sector: '반도체',
    info: '메모리 반도체를 주로 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다)' },
  { ticker: '005380', name: '현대차', base: 240000, volFactor: 0.85, baseVolume: 12000, sector: '자동차',
    info: '자동차를 설계·생산·판매하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다)' },
  { ticker: '035420', name: 'NAVER', base: 200000, volFactor: 1.0, baseVolume: 18000, sector: '인터넷·플랫폼',
    info: '검색, 커머스, 콘텐츠 등 온라인 서비스를 운영하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다)' },
  { ticker: '035720', name: '카카오', base: 50000, volFactor: 1.25, baseVolume: 60000, sector: '인터넷·플랫폼',
    info: '메신저를 바탕으로 여러 온라인 서비스를 운영하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다)' },
  { ticker: '373220', name: 'LG에너지솔루션', base: 400000, volFactor: 1.1, baseVolume: 4000, sector: '2차전지',
    info: '배터리를 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다)' },
  { ticker: '068270', name: '셀트리온', base: 180000, volFactor: 1.15, baseVolume: 15000, sector: '바이오',
    info: '바이오 의약품을 개발·생산하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다)' },
];

export const TICKER_MAP = new Map(TICKERS.map((t) => [t.ticker, t]));

const MIN = 60000;
const DAY_MIN = 1440;
const KST_OFFSET_MIN = 540;
const ANCHOR = Math.floor(Date.UTC(2026, 5, 1) / MIN); // 샘플 시장 시작 시점
const BASE_VOL = 0.001; // 1분당 변동폭(교육 효과를 위해 실제보다 크게)
const REVERSION = 0.00002; // 기준가로 되돌아가려는 힘 (가격이 무한정 벗어나지 않게)

const RANGES = {
  '1d': { bucketMin: 5, count: 288 },
  '1w': { bucketMin: 60, count: 168 },
  '1m': { bucketMin: DAY_MIN, count: 30 },
  '3m': { bucketMin: DAY_MIN, count: 90 },
};

function rnd(seed, i) {
  let t = (seed ^ Math.imul(i | 0, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function normal(seed, i) {
  // 균등분포 4개의 합으로 정규분포 근사
  return (rnd(seed, i * 4) + rnd(seed, i * 4 + 1) + rnd(seed, i * 4 + 2) + rnd(seed, i * 4 + 3) - 2) * Math.sqrt(3);
}
function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function roundTick(p) {
  const tick = p < 2000 ? 1 : p < 5000 ? 5 : p < 20000 ? 10 : p < 50000 ? 50 : p < 200000 ? 100 : p < 500000 ? 500 : 1000;
  return Math.max(tick, Math.round(p / tick) * tick);
}
const kstDayStartMin = (m) => Math.floor((m + KST_OFFSET_MIN) / DAY_MIN) * DAY_MIN - KST_OFFSET_MIN;

export function createMarket({ seed, volatility = 1 }) {
  const state = new Map(); // ticker -> { logs: number[] }
  const seeds = new Map();
  const tSeed = (ticker) => {
    if (!seeds.has(ticker)) seeds.set(ticker, (seed ^ strHash(ticker)) >>> 0);
    return seeds.get(ticker);
  };

  function logAt(ticker, minute) {
    const meta = TICKER_MAP.get(ticker);
    let s = state.get(ticker);
    const lb = Math.log(meta.base);
    if (!s) { s = { logs: [lb] }; state.set(ticker, s); }
    const idx = Math.max(0, minute - ANCHOR);
    const sd = tSeed(ticker);
    const vol = BASE_VOL * meta.volFactor * volatility;
    for (let j = s.logs.length; j <= idx; j++) {
      const prev = s.logs[j - 1];
      s.logs.push(prev - REVERSION * (prev - lb) + vol * normal(sd, j));
    }
    return s.logs[idx];
  }
  const minutePrice = (ticker, minute) => roundTick(Math.exp(logAt(ticker, minute)));

  function priceAt(ticker, ms) {
    const exact = ms / MIN;
    const m = Math.floor(exact);
    const a = Math.exp(logAt(ticker, m));
    const b = Math.exp(logAt(ticker, m + 1));
    let p = a + (b - a) * (exact - m);
    const meta = TICKER_MAP.get(ticker);
    const jitter = (rnd(tSeed(ticker) ^ 0x5bd1e995, Math.floor(ms / 10000)) - 0.5) * BASE_VOL * meta.volFactor * volatility;
    return roundTick(p * (1 + jitter));
  }

  const minuteVolume = (ticker, minute) => {
    const meta = TICKER_MAP.get(ticker);
    const dayShape = 0.6 + 0.8 * rnd(tSeed(ticker) ^ 0x1234567, minute);
    return Math.max(1, Math.round((meta.baseVolume / DAY_MIN) * dayShape * 2));
  };

  function prevClose(ticker, ms) {
    return minutePrice(ticker, kstDayStartMin(Math.floor(ms / MIN)));
  }
  function todayVolume(ticker, ms) {
    const m = Math.floor(ms / MIN);
    let v = 0;
    for (let i = kstDayStartMin(m); i <= m; i++) v += minuteVolume(ticker, i);
    return v;
  }

  function candles(ticker, range, ms) {
    const spec = RANGES[range];
    if (!spec) return null;
    const nowMin = Math.floor(ms / MIN);
    const align = (m) => (spec.bucketMin === DAY_MIN ? kstDayStartMin(m) : Math.floor(m / spec.bucketMin) * spec.bucketMin);
    const endStart = align(nowMin);
    const out = [];
    for (let b = endStart - (spec.count - 1) * spec.bucketMin; b <= endStart; b += spec.bucketMin) {
      const last = Math.min(b + spec.bucketMin - 1, nowMin);
      let o = 0, h = 0, l = Infinity, c = 0, v = 0;
      for (let m = b; m <= last; m++) {
        const p = minutePrice(ticker, m);
        if (m === b) o = p;
        if (p > h) h = p;
        if (p < l) l = p;
        c = p;
        v += minuteVolume(ticker, m);
      }
      if (last === nowMin) { // 진행 중인 마지막 캔들은 현재가로 마감
        c = priceAt(ticker, ms);
        h = Math.max(h, c);
        l = Math.min(l, c);
      }
      out.push({ t: b * MIN, o, h, l, c, v });
    }
    return out;
  }

  return { priceAt, prevClose, todayVolume, candles, ranges: Object.keys(RANGES) };
}
