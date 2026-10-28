/* 가나북스 공통 레이아웃 & 유틸 */
(function () {
  const C = GN.company;

  GN.menu = [
    { key: "company", href: "company.html", ko: "회사소개", en: "Company" },
    { key: "business", href: "business.html", ko: "판매영업대행", en: "Business" },
    { key: "bookstore", href: "bookstore.html", ko: "전국서점", en: "Bookstore" },
    { key: "dataroom", href: "dataroom.html", ko: "자료실", en: "Data Room" },
    { key: "board", href: "board.html", ko: "자유게시판", en: "Board" },
    { key: "request", href: "request.html", ko: "대행문의", en: "Request" },
    { key: "isbn", href: "https://www.nl.go.kr/seoji/", ko: "문헌번호센터", en: "ISBN Center", ext: true }
  ];

  GN.esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  GN.param = k => new URLSearchParams(location.search).get(k);
  GN.won = n => n.toLocaleString("ko-KR") + "원";
  GN.dot = d => d.replace(/-/g, ".");

  // 가나북스 로고 (마크 + 워드마크). 워드마크 검정 획은 currentColor를 따릅니다.
  GN.mark = (cls = "logo-mark") => `<svg class="${cls}" viewBox="0 0 360 360" aria-hidden="true">
      <path fill="#e3141c" d="M50 0h90v245h75v50H50zM315 245h35v50h-35z"/>
      <path fill="#7cc11c" d="M0 53h305v297h-90V105H0z"/></svg>`;
  GN.wordmark = (cls = "logo-word") => `<svg class="${cls}" viewBox="-6 -6 342 130" fill="none" stroke-width="10" aria-hidden="true">
      <g stroke="currentColor"><path d="M4 30H42Q38 72 6 102M58 8V114M58 58H76M92 24V94H136M150 8V114M294 14Q286 56 262 84M289 50Q305 74 328 84M256 106H332"/></g>
      <g stroke="#e3141c"><path d="M180 -2V42M232 -2V42M180 20H232M180 42H232M150 61H252M206 61V76M175 80H232V120"/></g></svg>`;
  GN.logo = (tag = true) => `
    <a class="logo" href="index.html" aria-label="가나북스 홈">
      ${GN.mark()}${GN.wordmark()}${tag ? '<span class="logo-tag">출판 · 유통</span>' : ""}
    </a>`;
  // 백년가게 물결 마크
  GN.hundredMark = (cls = "") => `<svg class="${cls}" viewBox="0 0 104 40" aria-hidden="true"><path d="M2 36 Q22 32 29 6 Q34 30 52 33 Q70 30 75 6 Q82 32 102 36" fill="none" stroke="#1f4e9c" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  GN.cover = (b, opts = {}) => {
    const [c1, c2] = b.color || ["#2f74d8", "#183a6e"];
    return `<div class="book-cover" style="background:linear-gradient(155deg, ${c1}, ${c2})">
      <span class="bc-cat">${GN.esc(b.category || "GANA BOOKS")}</span>
      <span class="bc-title">${GN.esc(b.title)}</span>
      <span class="bc-deco"><svg viewBox="0 0 100 40" width="70%" aria-hidden="true">
        <circle cx="20" cy="22" r="14" fill="rgba(255,255,255,.18)"/>
        <path d="M0 40 Q30 10 60 28 T100 18 V40Z" fill="rgba(255,255,255,.14)"/></svg></span>
      <span class="bc-author">${GN.esc(b.author || "")}</span>
      <span class="bc-pub">${GN.esc(b.publisher || "가나북스")}</span>
    </div>`;
  };

  // 지역 타일맵 (대략적인 지리 배치, 5열)
  const TILES = [
    "인천", "서울", "경기", "강원", "",
    "", "충남", "세종", "충북", "경북",
    "", "전북", "대전", "대구", "울산",
    "", "광주", "전남", "경남", "부산",
    "제주", "", "", "", ""
  ];
  const METRO = ["서울", "인천", "대전", "세종", "대구", "울산", "광주", "부산"];
  GN.regionTiles = (on, layout = TILES) => layout.map(k => k
    ? `<a href="bookstore.html?region=${encodeURIComponent(k)}" data-region="${k}" class="${METRO.includes(k) ? "metro" : ""}${k === on ? " on" : ""}">${k}<small>${GN.stores.filter(s => s.region === k).length}곳</small></a>`
    : `<span class="empty"></span>`).join("");

  function header(active) {
    const nav = GN.menu.map(m => `<a href="${m.href}"${m.ext ? ' target="_blank" rel="noopener" class="ext"' : ""}${m.key === active ? ' class="active" aria-current="page"' : ""}>${m.ko}<small>${m.en}</small></a>`).join("");
    return `
      <div class="topbar"><div class="container">
        <div class="tb-left"><span><strong>${C.award}</strong></span><span>${C.tagline}</span></div>
        <div class="tb-right"><a href="tel:${C.tel}">TEL ${C.tel}</a><span>FAX ${C.fax}</span></div>
      </div></div>
      <header class="site-header"><div class="container">
        ${GN.logo()}
        <nav class="gnb" aria-label="주 메뉴">${nav}</nav>
        <button class="menu-btn" aria-label="메뉴 열기" aria-expanded="false"><span></span></button>
      </div></header>`;
  }

  function footer() {
    const links = GN.menu.map(m => `<li><a href="${m.href}"${m.ext ? ' target="_blank" rel="noopener"' : ""}>${m.ko}</a></li>`).join("");
    return `
      <footer class="site-footer">
        <div class="container footer-top">
          <div>
            ${GN.logo()}
            <p style="font-family:var(--serif);color:#e7dfcb;font-size:17px">‘${C.motto}’</p>
            <p style="margin-top:8px">저희 가나북스는 출판사 여러분의 소중한 도서를<br>${C.slogan}.</p>
          </div>
          <div><h5>바로가기</h5><ul>${links}</ul></div>
          <div>
            <h5>고객센터</h5>
            <div class="footer-tel">${C.tel}</div>
            <p style="margin-top:6px">평일 ${C.hours} · FAX ${C.fax}<br>대표 ${C.ceo} ${C.mobile}<br>원고투고 및 문의 <a href="mailto:${C.email}">${C.email}</a> / <a href="mailto:${C.email2}">${C.email2}</a></p>
          </div>
        </div>
        <div class="footer-bottom"><div class="container">
          <span>상호 ${C.name}</span><span>대표자 ${C.ceo}</span><span>사업자등록번호 ${C.bizNo}</span><span>통신판매신고 ${C.mailOrder}</span>
          <span>찾아오실 때 ${C.address}</span><span>물건 보내실 때 ${C.logistics}</span>
          <span class="copy">© ${C.name}. All rights reserved.</span>
        </div></div>
      </footer>
      <button class="to-top" aria-label="맨 위로">↑</button>
      <div class="toast" role="status" aria-live="polite"></div>`;
  }

  GN.toast = msg => {
    const t = document.querySelector(".toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 2600);
  };

  document.addEventListener("DOMContentLoaded", () => {
    const active = document.body.dataset.page;
    document.body.insertAdjacentHTML("afterbegin", header(active));
    document.body.insertAdjacentHTML("beforeend", footer());

    const btn = document.querySelector(".menu-btn");
    btn.addEventListener("click", () => {
      const open = document.body.classList.toggle("nav-open");
      btn.setAttribute("aria-expanded", open);
    });

    const top = document.querySelector(".to-top");
    top.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));
    addEventListener("scroll", () => top.classList.toggle("show", scrollY > 600), { passive: true });

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12 });
      document.querySelectorAll(".reveal").forEach(el => io.observe(el));
    } else {
      document.querySelectorAll(".reveal").forEach(el => el.classList.add("in"));
    }
  });
})();
