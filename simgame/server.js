import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDb, getPriceSeed } from './lib/db.js';
import { createMarket, TICKERS, GROUPS } from './lib/market.js';
import { createGame, GameError } from './lib/game.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const MAX_BODY = 16 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
};
const PAGES = { '/': 'index.html', '/ranking': 'ranking.html', '/admin': 'admin.html' };

const sha = (s) => createHash('sha256').update(s).digest();

export function createApp({ dbPath = ':memory:', adminPassword, now = Date.now, frameAncestors = "'none'", volatility = 1 } = {}) {
  const db = openDb(dbPath);
  const market = createMarket({ seed: getPriceSeed(db), volatility });
  const game = createGame({ db, market, now });

  // ---- 요청 빈도 제한 (학교 공유 IP를 고려해 넉넉하게) ----
  const buckets = new Map();
  function limited(key, max, windowMs) {
    const t = now();
    let b = buckets.get(key);
    if (!b || b.reset <= t) { b = { n: 0, reset: t + windowMs }; buckets.set(key, b); }
    b.n += 1;
    return b.n > max;
  }
  const sweep = setInterval(() => { const t = now(); for (const [k, b] of buckets) if (b.reset <= t) buckets.delete(k); }, 60000);
  sweep.unref();

  // ---- 관리자 세션 ----
  const adminSessions = new Map();
  const adminHash = adminPassword ? sha(adminPassword) : null;
  function adminLogin(password) {
    if (!adminHash || typeof password !== 'string') return null;
    if (!timingSafeEqual(sha(password), adminHash)) return null;
    const token = randomBytes(24).toString('hex');
    adminSessions.set(token, now() + 8 * 3600 * 1000);
    return token;
  }
  const bearer = (req) => (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  function isAdmin(req) {
    const tok = bearer(req);
    const exp = adminSessions.get(tok);
    if (!exp) return false;
    if (exp <= now()) { adminSessions.delete(tok); return false; }
    return true;
  }

  const securityHeaders = {
    'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors ${frameAncestors}`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };

  function send(res, status, body, headers = {}) {
    res.writeHead(status, { ...securityHeaders, ...headers });
    res.end(body);
  }
  const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });

  function readJson(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { reject(new GameError('요청이 너무 큽니다.', 413)); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try {
          const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error();
          resolve(v);
        } catch { reject(new GameError('JSON 형식이 올바르지 않습니다.')); }
      });
      req.on('error', reject);
    });
  }

  const ip = (req) => req.socket.remoteAddress ?? 'unknown';
  const needAuth = (req) => {
    const a = game.authenticate(bearer(req));
    if (!a) throw new GameError('참가 정보가 없거나 만료되었습니다. 다시 참가해주세요.', 401);
    return a;
  };
  const needAdmin = (req) => { if (!isAdmin(req)) throw new GameError('관리자 인증이 필요합니다.', 401); };

  // CSV 수식 주입 방지
  const csvCell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };

  async function api(req, res, url) {
    const { pathname } = url;
    const m = req.method;

    if (pathname === '/api/event' && m === 'GET') {
      return json(res, 200, { event: game.publicEvent(game.currentEvent()) });
    }
    if (pathname === '/api/join' && m === 'POST') {
      if (limited(`join:${ip(req)}`, 200, 60000)) throw new GameError('요청이 너무 많습니다. 잠시 후 다시 시도하세요.', 429);
      const body = await readJson(req);
      return json(res, 200, game.join(body.nickname));
    }
    if (pathname === '/api/state' && m === 'GET') return json(res, 200, game.myState(needAuth(req)));
    if (pathname === '/api/transactions' && m === 'GET') return json(res, 200, { transactions: game.myTransactions(needAuth(req)) });
    if (pathname === '/api/trade' && m === 'POST') {
      const auth = needAuth(req);
      if (limited(`trade:${auth.user.id}`, 60, 60000)) throw new GameError('거래 요청이 너무 빠릅니다. 잠시 후 다시 시도하세요.', 429);
      return json(res, 200, { trade: game.trade(auth, await readJson(req)), state: game.myState(auth) });
    }
    if (pathname === '/api/compare' && m === 'GET') return json(res, 200, game.compare(needAuth(req), url.searchParams.get('code') ?? ''));
    if (pathname === '/api/report' && m === 'GET') return json(res, 200, game.report(needAuth(req)));
    if (pathname === '/api/ranking' && m === 'GET') return json(res, 200, game.ranking(game.currentEvent()));
    if (pathname === '/api/tickers' && m === 'GET') return json(res, 200, { tickers: TICKERS.map(({ ticker, name, sector, group, unit }) => ({ ticker, name, sector, group, unit })), groups: GROUPS });

    const cm = pathname.match(/^\/api\/stocks\/([A-Za-z0-9._-]{1,12})\/candles$/);
    if (cm && m === 'GET') {
      const ev = game.currentEvent();
      if (!ev) throw new GameError('진행 중인 이벤트가 없습니다.', 404);
      const range = url.searchParams.get('range') ?? '1d';
      return json(res, 200, { ticker: cm[1], range, candles: game.candles(ev, cm[1], range) });
    }

    // ----- 관리자 -----
    if (pathname === '/api/admin/login' && m === 'POST') {
      if (limited(`login:${ip(req)}`, 10, 60000)) throw new GameError('로그인 시도가 너무 많습니다. 1분 뒤 다시 시도하세요.', 429);
      const tok = adminLogin((await readJson(req)).password);
      if (!tok) throw new GameError('비밀번호가 올바르지 않습니다.', 401);
      return json(res, 200, { token: tok });
    }
    if (pathname.startsWith('/api/admin/')) {
      needAdmin(req);
      if (pathname === '/api/admin/overview' && m === 'GET') return json(res, 200, game.adminOverview());
      if (pathname === '/api/admin/transactions' && m === 'GET') return json(res, 200, { transactions: game.adminTransactions() });
      if (pathname === '/api/admin/event' && m === 'POST') return json(res, 200, { event: game.createEvent(await readJson(req)) });
      if (pathname === '/api/admin/event' && m === 'PATCH') return json(res, 200, { event: game.updateEvent(await readJson(req)) });
      if (pathname === '/api/admin/event/start' && m === 'POST') return json(res, 200, { event: game.startEvent() });
      if (pathname === '/api/admin/event/end' && m === 'POST') return json(res, 200, { event: game.endEvent() });
      if (pathname === '/api/admin/event/reset' && m === 'POST') return json(res, 200, { event: game.resetEvent() });
      if (pathname === '/api/admin/export.csv' && m === 'GET') {
        const head = ['시각', '닉네임', '코드', '종목', '구분', '수량', '체결가(P)', '실현손익(P)', '이유'];
        const lines = [head.map(csvCell).join(',')];
        for (const t of game.adminTransactions(10000).reverse()) {
          lines.push([new Date(t.created_at).toISOString(), t.nickname, t.code, t.name, t.type === 'buy' ? '매수' : '매도', t.quantity, t.price, t.realized_pl, t.reason].map(csvCell).join(','));
        }
        return send(res, 200, '﻿' + lines.join('\r\n'), {
          'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="transactions.csv"', 'Cache-Control': 'no-store',
        });
      }
    }
    throw new GameError('요청한 API를 찾을 수 없습니다.', 404);
  }

  async function serveStatic(req, res, pathname) {
    const rel = PAGES[pathname] ?? decodeURIComponent(pathname).replace(/^\/+/, '');
    const file = path.resolve(PUBLIC_DIR, rel);
    if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
    const type = MIME[path.extname(file)];
    if (!type) return send(res, 404, 'Not found');
    try {
      const data = await readFile(file);
      return send(res, 200, req.method === 'HEAD' ? '' : data, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    } catch {
      return send(res, 404, 'Not found');
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
      return await serveStatic(req, res, url.pathname);
    } catch (e) {
      if (e instanceof GameError) return json(res, e.status, { error: e.message });
      console.error(e);
      return json(res, 500, { error: '서버 오류가 발생했습니다.' });
    }
  });
  server.on('close', () => { clearInterval(sweep); db.close(); });
  return { server, game, db };
}

// ---- 직접 실행 ----
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  let adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    adminPassword = randomBytes(6).toString('hex');
    console.log(`[보안] ADMIN_PASSWORD 환경변수가 없어 임시 관리자 비밀번호를 만들었습니다: ${adminPassword}`);
    console.log('       (서버를 다시 시작하면 바뀝니다. 고정하려면 ADMIN_PASSWORD=... 로 실행하세요)');
  }
  if (process.env.MARKET_DATA_MODE && process.env.MARKET_DATA_MODE !== 'demo') {
    console.log('[안내] MARKET_DATA_MODE는 아직 DEMO(샘플 데이터)만 지원합니다. DEMO MODE로 실행합니다.');
  }
  const { server } = createApp({
    dbPath: process.env.DB_PATH ?? path.join(ROOT, 'data', 'game.db'),
    adminPassword,
    frameAncestors: process.env.FRAME_ANCESTORS ?? "'none'",
    volatility: Number(process.env.DEMO_VOLATILITY ?? 1),
  });
  server.listen(port, () => {
    console.log(`SAFE INVEST (DEMO MODE) 실행 중 → 너굴이: http://localhost:${port}/  순위화면: /ranking  너굴 관리자: /admin`);
  });
}
