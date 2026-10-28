/* 게시판 목록 공통 렌더러 (자유게시판 · 자료실) */
GN.boardList = function ({ posts, viewPage, el, pageSize = 10 }) {
  const state = { page: Number(GN.param("page")) || 1, field: "title", q: "" };
  const tbody = el.querySelector("tbody");
  const pager = el.querySelector(".pager");
  const total = el.querySelector(".total");

  function render() {
    const q = state.q.trim();
    const list = posts
      .filter(p => !q || String(p[state.field] || "").includes(q))
      .sort((a, b) => (b.notice ? 1 : 0) - (a.notice ? 1 : 0) || b.no - a.no);
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    state.page = Math.min(state.page, pages);
    const rows = list.slice((state.page - 1) * pageSize, state.page * pageSize);
    total.textContent = list.length;
    tbody.innerHTML = rows.length ? rows.map(p => `
      <tr class="${p.notice ? "notice" : ""}">
        <td>${p.notice ? '<span class="badge orange">공지</span>' : p.no}</td>
        <td class="title"><a href="${viewPage}?no=${p.no}">${GN.esc(p.title)}</a>${p.file ? '<span class="file">📎</span>' : ""}${p.bookId ? ' <span class="badge" style="height:20px;font-size:11px">신간</span>' : ""}</td>
        <td>${GN.esc(p.writer || "가나북스")}</td>
        <td>${GN.dot(p.date)}</td>
        <td>${p.hit}</td>
      </tr>`).join("") : `<tr><td colspan="5" style="padding:60px">검색 결과가 없습니다.</td></tr>`;

    let html = `<a href="#" data-p="${Math.max(1, state.page - 1)}" aria-label="이전">‹</a>`;
    for (let i = 1; i <= pages; i++) html += i === state.page ? `<span class="on">${i}</span>` : `<a href="#" data-p="${i}">${i}</a>`;
    html += `<a href="#" data-p="${Math.min(pages, state.page + 1)}" aria-label="다음">›</a>`;
    pager.innerHTML = html;
  }

  pager.addEventListener("click", e => {
    const a = e.target.closest("a[data-p]");
    if (!a) return;
    e.preventDefault();
    state.page = Number(a.dataset.p);
    history.replaceState(null, "", state.page > 1 ? `?page=${state.page}` : location.pathname);
    render();
    el.scrollIntoView({ behavior: "smooth" });
  });
  el.querySelector("form").addEventListener("submit", e => {
    e.preventDefault();
    state.field = el.querySelector("select").value;
    state.q = el.querySelector("input").value;
    state.page = 1;
    render();
  });
  render();
};

/* 게시글 이전/다음 */
GN.prevNext = (posts, no, viewPage) => {
  const sorted = [...posts].sort((a, b) => b.no - a.no);
  const i = sorted.findIndex(p => p.no === no);
  const prev = sorted[i + 1], next = sorted[i - 1];
  return `<li><span>다음글 ▲</span>${next ? `<a href="${viewPage}?no=${next.no}">${GN.esc(next.title)}</a>` : "다음글이 없습니다."}</li>
          <li><span>이전글 ▼</span>${prev ? `<a href="${viewPage}?no=${prev.no}">${GN.esc(prev.title)}</a>` : "이전글이 없습니다."}</li>`;
};

/* 게시글이 속한 목록 페이지 번호 (목록 버튼용) */
GN.pageOf = (posts, no, pageSize = 10) => {
  const sorted = [...posts].sort((a, b) => (b.notice ? 1 : 0) - (a.notice ? 1 : 0) || b.no - a.no);
  return Math.floor(sorted.findIndex(p => p.no === no) / pageSize) + 1;
};
