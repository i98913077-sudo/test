// 공통 유틸. innerHTML을 쓰지 않고 항상 textContent로만 그려서 XSS를 구조적으로 막는다.
export const DISCLAIMER = '본 서비스는 교육 및 게임 목적으로 제작된 가상 모의투자 콘텐츠입니다. 실제 금융투자 또는 증권거래가 아니며, 실제 금전적 가치가 없는 가상 포인트를 사용합니다.';
export const BANNER = '🎓 교육용 가상 모의투자 · 실제 돈 아님 (가상 P)';

// 네이티브 append()는 null/false를 "null"/"false" 글자로 넣어버린다. 조건부 요소(cond ? el : null)를 안전하게 쓰기 위해 걸러낸다.
const nativeAppend = Element.prototype.append;
Element.prototype.append = function (...kids) { return nativeAppend.apply(this, kids.filter((k) => k != null && k !== false)); };

const PROP_KEYS = new Set(['value', 'disabled', 'checked', 'selected', 'readOnly']);
export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (PROP_KEYS.has(k)) e[k] = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return e;
}
export const $ = (s, r = document) => r.querySelector(s);
export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

export const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
export const fmtP = (n) => `${fmt(n)}P`;
// 좁은 화면용 축약 표기: 1.25억P, 5,725만P
export function fmtCompact(n) {
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(2).replace(/\.?0+$/, '')}억P`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e4).toLocaleString('ko-KR')}만P`;
  return `${sign}${fmt(a)}P`;
}
export const fmtPct = (r, digits = 2) => `${r > 0 ? '+' : ''}${(r * 100).toFixed(digits)}%`;
export const fmtSigned = (n) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${fmt(Math.abs(n))}P`;
export const dir = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
export const arrow = (n) => (n > 0 ? '▲' : n < 0 ? '▼' : '–');
export const fmtTime = (ms) => new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(r).padStart(2, '0')}`;
}

const TOKEN_KEY = 'safeinvest.token';
export const store = {
  get token() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set token(v) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* 저장 불가 환경 */ } },
};

// '/api/state?x=1' → 'api.php?r=state&x=1' (서버 리라이트 설정 없이 어느 호스팅에서나 동작)
export function apiUrl(path) {
  const [route, query] = path.replace(/^\/api\//, '').split('?');
  return new URL(`api.php?r=${route}${query ? `&${query}` : ''}`, document.baseURI).href;
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'text/plain;charset=UTF-8'; // 서버는 본문을 직접 JSON으로 해석한다. 일부 호스팅 보안필터가 application/json POST를 막는 것을 피한다
  if (token) headers['X-Auth-Token'] = token; // Authorization 헤더는 일부 PHP 호스팅이 걸러내서 커스텀 헤더 사용
  let res;
  try { res = await fetch(apiUrl(path), { method, headers, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw Object.assign(new Error('네트워크 연결을 확인해주세요.'), { status: 0 }); }
  // 응답을 글자로 먼저 읽고(앞의 BOM 제거) JSON이면 해석한다. 호스팅이 HTML 오류 페이지를 돌려줄 때 원인을 알 수 있게 한다.
  const text = (await res.text().catch(() => '')).replace(/^\uFEFF/, '').trim();
  let data = {};
  try { data = JSON.parse(text); } catch { data = null; }
  if (data === null) {
    const hint = res.status === 403 || res.status === 406 || res.status === 409
      ? '호스팅의 보안 설정이 요청을 막았을 수 있어요. 호스팅 고객센터에 "api.php POST 요청이 403으로 차단된다"고 문의하세요.'
      : 'api.php가 올바른 JSON을 돌려주지 않았어요. 폴더 위치와 PHP 버전을 확인하세요.';
    throw Object.assign(new Error(`서버 응답 오류 (${res.status}). ${hint}`), { status: res.status });
  }
  if (!res.ok) throw Object.assign(new Error(data.error ?? `오류가 발생했습니다 (${res.status})`), { status: res.status });
  return data;
}

export function disclaimerBlock() {
  return el('p', { class: 'disclaimer' }, DISCLAIMER);
}
export function banner() {
  return el('div', { class: 'edu-banner' }, BANNER);
}
let toastTimer;
export function toast(msg) {
  document.querySelectorAll('.toast').forEach((n) => n.remove());
  const t = el('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}
export const COLORS = ['#2b5fd9', '#d6342c', '#16a06a', '#e8a317', '#8a4fd6', '#0ea5b7', '#d6479f', '#6b7280'];
