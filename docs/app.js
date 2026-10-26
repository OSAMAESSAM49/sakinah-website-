// Sakinah — سكينة · front-end
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/\d/g, (d) => AR[d]);
const pad = (n) => ar(String(n).padStart(2, '0'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const BOOK_SHORT = { bukhari: 'البخاري', muslim: 'مسلم', abudawud: 'أبو داود', tirmidhi: 'الترمذي', nasai: 'النسائي', ibnmajah: 'ابن ماجه' };
const PAGE = 24;

const state = {
  q: '',
  type: 'all',
  book: '',
  items: [],
  total: 0,
  counts: null,
  loading: false,
  done: false,
  view: 'stack',
  active: 0,
  req: 0,
};

const el = {
  form: $('#searchForm'),
  input: $('#q'),
  clear: $('#clearBtn'),
  chips: $('#chips'),
  results: $('#results'),
  resultsQuery: $('#resultsQuery'),
  tabs: $('#tabs'),
  ink: $('.tabs__ink'),
  books: $('#books'),
  stage: $('#stage'),
  stack: $('#stack'),
  grid: $('#grid'),
  sentinel: $('#sentinel'),
  caption: $('#caption'),
  progress: $('#progressBar'),
  counterNow: $('#counterNow'),
  counterTotal: $('#counterTotal'),
  prev: $('#prevBtn'),
  next: $('#nextBtn'),
  loading: $('#stateLoading'),
  empty: $('#stateEmpty'),
  emptyText: $('#emptyText'),
  toast: $('#toast'),
  daily: $('#daily'),
  dailyCard: $('#dailyCard'),
};

/* ==========================================================================
   Card rendering
   ========================================================================== */

const ICONS = {
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V4m0 0L8 8m4-4 4 4"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
  chain: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h7"/></svg>',
};

function textHtml(item) {
  const hl = new Set(item.hl || []);
  return item.text
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (hl.has(i) ? `<mark>${esc(w)}</mark>` : esc(w)))
    .join(' ');
}

function cardHtml(item, i) {
  const ornament = '<svg class="card__ornament" viewBox="0 0 48 48" aria-hidden="true"><use href="#khatam"/></svg>';
  if (item.kind === 'quran') {
    return `
<article class="card card--quran" data-i="${i}" aria-label="سورة ${esc(item.surah.name)} الآية ${item.ayah}">
  ${ornament}
  <div class="card__top">
    <span class="card__kind"><svg viewBox="0 0 48 48" aria-hidden="true"><use href="#khatam"/></svg>آية كريمة</span>
    <span class="card__ref">الجزء <b>${ar(item.juz)}</b> · الصفحة <b>${ar(item.page)}</b></span>
  </div>
  <h3 class="card__source">سورة ${esc(item.surah.name)}<small>الآية ${ar(item.ayah)} من ${ar(item.surah.ayahCount)} · ${item.surah.revelation}</small></h3>
  <div class="card__body">
    <p class="card__text"><span class="orn">﴿</span>${textHtml(item)}<span class="ayah-no">${ar(item.ayah)}</span><span class="orn">﴾</span></p>
  </div>
  <div class="card__foot">
    <div class="card__meta"><span class="tag">﴿ ${esc(item.surah.name)} : <b>${ar(item.ayah)}</b> ﴾</span></div>
    <div class="card__actions">
      <button class="icon-btn" data-act="copy" type="button" aria-label="نسخ الآية" title="نسخ">${ICONS.copy}</button>
      <button class="icon-btn" data-act="share" type="button" aria-label="مشاركة" title="مشاركة">${ICONS.share}</button>
      <a class="icon-btn" href="https://quran.com/${item.surah.number}/${item.ayah}" target="_blank" rel="noopener" aria-label="فتح على Quran.com" title="فتح المصدر">${ICONS.open}</a>
    </div>
  </div>
</article>`;
  }

  const g = item.grade;
  const grade = g ? `<span class="grade grade--${g.tone}">${esc(g.label)}<small>· ${esc(g.by)}</small></span>` : '<span class="grade grade--neutral">لم يُذكر حكم</span>';
  const others = (item.grades || []).slice(1);
  return `
<article class="card card--hadith" data-i="${i}" aria-label="${esc(item.bookName)} ${item.number}">
  ${ornament}
  <div class="card__top">
    <span class="card__kind"><svg viewBox="0 0 48 48" aria-hidden="true"><use href="#khatam"/></svg>حديث شريف</span>
    <span class="card__ref">رقم <b>${ar(item.number)}</b></span>
  </div>
  <h3 class="card__source">${esc(item.bookName)}<small>${item.narrator ? `الراوي: ${esc(item.narrator)}` : esc(item.author)}</small></h3>
  <div class="card__body">
    <p class="card__text">${textHtml(item)}</p>
  </div>
  <div class="card__foot">
    <div class="card__meta">${grade}</div>
    <div class="card__actions">
      ${item.fullText ? `<button class="icon-btn" data-act="full" type="button" aria-label="عرض السند كاملًا" title="السند كاملًا">${ICONS.chain}</button>` : ''}
      <button class="icon-btn" data-act="copy" type="button" aria-label="نسخ الحديث" title="نسخ">${ICONS.copy}</button>
      <button class="icon-btn" data-act="share" type="button" aria-label="مشاركة" title="مشاركة">${ICONS.share}</button>
      <a class="icon-btn" href="${esc(item.url)}" target="_blank" rel="noopener" aria-label="فتح على Sunnah.com" title="فتح المصدر">${ICONS.open}</a>
    </div>
    ${others.length ? `<div class="grades-more">${others.map((o) => `<span>${esc(o.by)}: ${esc(o.label)}</span>`).join('')}</div>` : ''}
  </div>
</article>`;
}

function skeletonHtml(i) {
  return `<article class="card is-skeleton" data-i="${i}">
    <span class="sk" style="width:30%"></span><span class="sk" style="width:55%;height:22px"></span>
    <span class="sk"></span><span class="sk" style="width:92%"></span><span class="sk" style="width:80%"></span><span class="sk" style="width:64%"></span>
  </article>`;
}

/* ==========================================================================
   Stack (coverflow) — inspired by 3D card-stack carousels
   ========================================================================== */

const stack = { float: 0, cards: [] };

function stepSize() {
  const w = stack.cards[0]?.offsetWidth || 520;
  return { near: w * (innerWidth < 760 ? 0.62 : 0.56), far: w * (innerWidth < 760 ? 0.1 : 0.15) };
}

function layoutStack(pos = state.active) {
  const { near, far } = stepSize();
  stack.cards.forEach((card, i) => {
    const d = i - pos;
    const ad = Math.abs(d);
    const s = Math.sign(d);
    if (ad > 4) {
      card.style.visibility = 'hidden';
      card.style.opacity = '0';
      card.style.transform = `translate3d(${-s * (near + 3 * far)}px,0,-600px)`;
      return;
    }
    const x = -s * (ad <= 1 ? ad * near : near + (ad - 1) * far); // RTL: next cards sit on the left
    const z = -Math.min(ad, 4) * 150;
    const ry = -s * Math.min(ad, 1) * 26;
    const sc = 1 - Math.min(ad, 3) * 0.05;
    card.style.visibility = 'visible';
    card.style.zIndex = String(100 - Math.round(ad * 10));
    card.style.opacity = String(ad > 3 ? Math.max(0, 1 - (ad - 3)) : 1 - Math.min(ad, 3) * 0.12);
    card.style.transform = `translate3d(${x}px,0,${z}px) rotateY(${ry}deg) scale(${sc})`;
    card.classList.toggle('is-active', Math.round(pos) === i && !card.classList.contains('is-skeleton'));
  });
}

function renderStack(append = false) {
  if (!append) el.stack.innerHTML = '';
  const from = append ? stack.cards.length : 0;
  const html = state.items.slice(from).map((it, k) => cardHtml(it, from + k)).join('');
  el.stack.insertAdjacentHTML('beforeend', html);
  stack.cards = $$('.card', el.stack);
  if (!append) {
    // Cards rise into place one after another
    stack.cards.forEach((c, i) => {
      if (i > 6) return;
      c.classList.add('is-entering');
      setTimeout(() => c.classList.remove('is-entering'), reduceMotion ? 0 : 120 + i * 90);
    });
  }
  layoutStack();
  updateMeta();
}

function goTo(i) {
  const max = state.items.length - 1;
  const next = Math.max(0, Math.min(max, i));
  if (next === state.active && stack.float === next) return layoutStack();
  state.active = next;
  stack.float = next;
  layoutStack();
  updateMeta(true);
  if (!state.done && state.items.length - next < 7) loadMore();
}

function updateMeta(tick = false) {
  const n = state.items.length ? state.active + 1 : 0;
  el.counterNow.textContent = pad(n);
  el.counterTotal.textContent = pad(state.total);
  if (tick) {
    el.counterNow.classList.remove('tick');
    void el.counterNow.offsetWidth;
    el.counterNow.classList.add('tick');
  }
  el.progress.style.width = state.total ? `${(n / state.total) * 100}%` : '0';
  el.prev.disabled = state.active <= 0;
  el.next.disabled = state.active >= state.items.length - 1;

  const it = state.items[state.active];
  if (!it) return (el.caption.innerHTML = '');
  const cap =
    it.kind === 'quran'
      ? `<span class="cap__main">سورة ${esc(it.surah.name)}</span><span class="cap__sub">الآية ${ar(it.ayah)}<i>•</i>الجزء ${ar(it.juz)}<i>•</i>${it.surah.revelation}</span>`
      : `<span class="cap__main">${esc(it.narrator || it.bookName)}</span><span class="cap__sub">${esc(it.bookName)}<i>•</i>${ar(it.number)}${it.grade ? `<i>•</i>${esc(it.grade.label)}` : ''}</span>`;
  el.caption.innerHTML = `<div class="cap">${cap}</div>`;
}

// Drag / swipe
(() => {
  let startX = 0, startY = 0, startPos = 0, dragging = false, pressed = false, moved = false, lastX = 0, lastT = 0, vel = 0;
  el.stack.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button, a')) return;
    pressed = true; dragging = false; moved = false;
    startX = lastX = e.clientX; startY = e.clientY; startPos = state.active; lastT = performance.now(); vel = 0;
  });
  el.stack.addEventListener('pointermove', (e) => {
    if (!pressed) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!dragging) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) {
        if (Math.abs(dy) > 10) pressed = false; // vertical scroll wins
        return;
      }
      dragging = moved = true;
      el.stack.setPointerCapture(e.pointerId);
      el.stack.classList.add('is-dragging');
    }
    const now = performance.now();
    vel = (e.clientX - lastX) / Math.max(1, now - lastT);
    lastX = e.clientX; lastT = now;
    const { near } = stepSize();
    stack.float = Math.max(-0.4, Math.min(state.items.length - 0.6, startPos + dx / near));
    layoutStack(stack.float);
  });
  const end = () => {
    if (!pressed) return;
    pressed = false;
    if (!dragging) return;
    dragging = false;
    el.stack.classList.remove('is-dragging');
    goTo(Math.round(stack.float + Math.max(-1, Math.min(1, vel * 0.6))));
  };
  el.stack.addEventListener('pointerup', end);
  el.stack.addEventListener('pointercancel', end);

  el.stack.addEventListener('click', (e) => {
    if (moved) { moved = false; return; }
    const card = e.target.closest('.card');
    if (card && !card.classList.contains('is-active') && !e.target.closest('button, a')) goTo(Number(card.dataset.i));
  });

  let wheelLock = 0;
  el.stack.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 12) return;
    e.preventDefault();
    const now = Date.now();
    if (now - wheelLock < 420) return;
    wheelLock = now;
    goTo(state.active + (e.deltaX < 0 ? 1 : -1));
  }, { passive: false });

  // Specular glare follows the pointer on the active card
  el.stack.addEventListener('pointermove', (e) => {
    const card = e.target.closest('.card.is-active');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    card.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  });
})();

el.prev.addEventListener('click', () => goTo(state.active - 1));
el.next.addEventListener('click', () => goTo(state.active + 1));

document.addEventListener('keydown', (e) => {
  if (e.target === el.input || el.results.hidden || state.view !== 'stack' || el.daily.open) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(state.active + 1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); goTo(state.active - 1); }
});

addEventListener('resize', () => state.view === 'stack' && layoutStack());

/* ==========================================================================
   Grid view
   ========================================================================== */

const revealObserver = new IntersectionObserver(
  (entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('is-visible'); revealObserver.unobserve(en.target); }
  }),
  { rootMargin: '0px 0px -8% 0px' },
);

const colCount = () => (innerWidth < 760 ? 1 : innerWidth < 1100 ? 2 : 3);
let gridCols = 0;

// Masonry: each new card goes into the currently shortest column, so loading more never reshuffles.
function renderGrid(append = false) {
  if (!append || gridCols !== colCount()) {
    gridCols = colCount();
    el.grid.innerHTML = Array.from({ length: gridCols }, () => '<div class="grid__col"></div>').join("");
    append = false;
  }
  const cols = $$(".grid__col", el.grid);
  const from = append ? $$(".card", el.grid).length : 0;
  state.items.slice(from).forEach((it, k) => {
    const shortest = cols.reduce((m, c) => (c.offsetHeight < m.offsetHeight ? c : m), cols[0]);
    shortest.insertAdjacentHTML("beforeend", cardHtml(it, from + k));
    const card = shortest.lastElementChild;
    card.style.setProperty("--i", k % 6);
    revealObserver.observe(card);
  });
}

addEventListener("resize", () => {
  if (state.view === "grid" && !el.grid.hidden && gridCols !== colCount()) renderGrid();
});

new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && state.view === 'grid' && !el.results.hidden) loadMore();
}, { rootMargin: '600px' }).observe(el.sentinel);

// Gentle tilt in grid view
el.grid.addEventListener('pointermove', (e) => {
  const card = e.target.closest('.card.is-visible');
  if (!card || e.pointerType !== 'mouse') return;
  const r = card.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
  card.style.transitionDelay = '0s';
  card.style.transform = `perspective(1000px) rotateX(${(0.5 - py) * 5}deg) rotateY(${(px - 0.5) * 6}deg) translateY(-4px)`;
  card.style.setProperty('--mx', `${px * 100}%`);
  card.style.setProperty('--my', `${py * 100}%`);
});
el.grid.addEventListener('pointerout', (e) => {
  const card = e.target.closest('.card');
  if (card && !card.contains(e.relatedTarget)) card.style.transform = '';
});

/* ==========================================================================
   Data
   ========================================================================== */

// The search runs entirely in the browser: engine.js (a Web Worker) downloads the Quran and the
// six books once from data/, then answers queries locally — no server needed (GitHub Pages friendly).
const engine = (() => {
  let worker = null;
  let seq = 0;
  let ready = false;
  let progress = 0;
  const pending = new Map();

  const fail = (message) => {
    for (const p of pending.values()) p.reject(new Error(message));
    pending.clear();
    worker?.terminate();
    worker = null; // the next call starts a fresh worker (retry)
    ready = false;
    progress = 0;
  };

  const start = () => {
    if (worker) return;
    worker = new Worker('engine.js');
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') { progress = data.loaded / data.total; return showProgress(); }
      if (data.type === 'ready') { ready = true; return; }
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.error) fail(data.error);
      else p.resolve(data.result);
    };
    worker.onerror = () => fail('تعذّر تشغيل محرك البحث، أعد تحميل الصفحة.');
  };

  const call = (cmd, args) => {
    start();
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, cmd, args });
    });
  };

  return { start, call, get ready() { return ready; }, get progress() { return progress; } };
})();

// While the data downloads (first visit), tell the user what is happening.
function showProgress() {
  if (engine.ready || !state.loading || el.results.hidden) return;
  const msg = `نجهّز المصحف والكتب الستة… ${ar(Math.round(engine.progress * 100))}٪`;
  if (state.view === 'stack') el.caption.innerHTML = `<div class="cap"><span class="cap__sub">${msg}</span></div>`;
  else el.loading.querySelector('p').textContent = msg;
}

function fetchPage(offset) {
  return engine.call('search', { q: state.q, type: state.type, book: state.book, offset, limit: PAGE });
}

async function runSearch({ push = true } = {}) {
  const q = state.q.trim();
  if (!q) return;
  const req = ++state.req;
  Object.assign(state, { items: [], total: 0, active: 0, done: false, loading: true });
  stack.float = 0;

  setSearching(true);
  el.results.hidden = false;
  el.resultsQuery.innerHTML = `«<span class="q">${esc(q)}</span>»`;
  el.empty.hidden = true;
  el.loading.querySelector('p').textContent = 'نبحث لك بهدوء…';
  showLoading(true);
  showProgress();

  if (push) {
    const url = new URL(location.href);
    url.searchParams.set('q', q);
    state.type === 'all' ? url.searchParams.delete('type') : url.searchParams.set('type', state.type);
    state.book ? url.searchParams.set('book', state.book) : url.searchParams.delete('book');
    history.pushState({}, '', url);
  }
  document.title = `${q} · سكينة`;
  scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });

  try {
    const data = await fetchPage(0);
    if (req !== state.req) return;
    state.items = data.items;
    state.total = data.total;
    state.counts = data.counts;
    state.done = data.items.length >= data.total;
    renderCounts();
    showLoading(false);
    if (!data.total) {
      el.emptyText.innerHTML = `لم نجد نتائج لـ «${esc(q)}»${state.type !== 'all' || state.book ? ' في هذا القسم' : ''}.`;
      el.empty.hidden = false;
      el.stage.hidden = true;
      el.grid.hidden = true;
      return;
    }
    applyView();
  } catch (err) {
    if (req !== state.req) return;
    showLoading(false);
    el.emptyText.textContent = err.message || 'حدث خطأ، حاول مرة أخرى.';
    el.empty.hidden = false;
    el.stage.hidden = true;
  } finally {
    if (req === state.req) state.loading = false;
  }
}

async function loadMore() {
  if (state.loading || state.done || !state.q) return;
  state.loading = true;
  const req = state.req;
  try {
    const data = await fetchPage(state.items.length);
    if (req !== state.req) return;
    state.items.push(...data.items);
    state.done = state.items.length >= data.total || !data.items.length;
    state.view === 'stack' ? renderStack(true) : renderGrid(true);
  } catch { /* silent: user can retry by navigating */ }
  finally { if (req === state.req) state.loading = false; }
}

function showLoading(on) {
  el.loading.hidden = !on;
  if (on) {
    el.grid.hidden = true;
    el.stage.hidden = state.view !== 'stack';
    if (state.view === 'stack') {
      el.stack.innerHTML = [0, 1, 2, 3, 4].map(skeletonHtml).join('');
      stack.cards = $$('.card', el.stack);
      layoutStack(0);
      el.loading.hidden = true;
      el.caption.innerHTML = '';
    }
  }
}

function renderCounts() {
  const c = state.counts;
  if (!c) return;
  $$('[data-count]', el.tabs).forEach((b) => (b.textContent = ar(c[b.dataset.count])));
  const showBooks = state.type === 'hadith' && c.hadith > 0;
  el.books.hidden = !showBooks;
  if (showBooks) {
    el.books.innerHTML =
      `<button type="button" data-book="" class="${state.book ? '' : 'is-active'}" style="--i:0">كل الكتب<span>${ar(c.hadith)}</span></button>` +
      Object.entries(c.books)
        .map(([id, n], k) => `<button type="button" data-book="${id}" class="${state.book === id ? 'is-active' : ''}" style="--i:${k + 1}">${BOOK_SHORT[id]}<span>${ar(n)}</span></button>`)
        .join('');
  }
  moveInk();
}

function moveInk() {
  const btn = $('button.is-active', el.tabs);
  if (!btn) return;
  el.ink.style.left = `${btn.offsetLeft}px`;
  el.ink.style.width = `${btn.offsetWidth}px`;
}
addEventListener('resize', moveInk);

function applyView() {
  $$('.view-toggle button').forEach((b) => b.classList.toggle('is-active', b.dataset.view === state.view));
  el.stage.hidden = state.view !== 'stack';
  el.grid.hidden = state.view !== 'grid';
  $('#counter').style.visibility = state.view === 'stack' ? 'visible' : 'hidden';
  if (!state.items.length) return;
  if (state.view === 'stack') renderStack();
  else renderGrid();
}

/* ==========================================================================
   Interactions
   ========================================================================== */

el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = el.input.value.trim();
  if (!q) return el.input.focus();
  state.q = q;
  state.book = '';
  el.input.blur();
  runSearch();
});

el.input.addEventListener('input', () => el.form.classList.toggle('has-value', !!el.input.value));
el.clear.addEventListener('click', () => {
  el.input.value = '';
  el.form.classList.remove('has-value');
  el.input.focus();
});

el.chips.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  el.input.value = b.textContent.trim();
  el.form.classList.add('has-value');
  el.form.requestSubmit();
});

el.tabs.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-type]');
  if (!b || b.dataset.type === state.type) return;
  $$('button', el.tabs).forEach((x) => x.classList.toggle('is-active', x === b));
  state.type = b.dataset.type;
  state.book = '';
  moveInk();
  runSearch();
});

el.books.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-book]');
  if (!b || b.dataset.book === state.book) return;
  state.book = b.dataset.book;
  runSearch();
});

$$('.view-toggle button').forEach((b) =>
  b.addEventListener('click', () => {
    if (state.view === b.dataset.view) return;
    state.view = b.dataset.view;
    try { localStorage.setItem('sakinah:view', state.view); } catch {}
    applyView();
  }),
);

// Card actions (copy / share / full chain) — delegated for both views and the dialog
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const card = btn.closest('.card');
  const item = card.dataset.i === 'daily' ? dailyItem : state.items[Number(card.dataset.i)];
  if (!item) return;
  const act = btn.dataset.act;

  if (act === 'full') {
    const body = $('.card__body', card);
    const existing = $('.card__full', card);
    if (existing) { existing.remove(); btn.classList.remove('is-on'); return; }
    body.insertAdjacentHTML('beforeend', `<div class="card__full"><span class="card__full-label">النص كاملًا بالسند</span>${esc(item.fullText)}</div>`);
    btn.classList.add('is-on');
    return;
  }

  const text = item.kind === 'quran'
    ? `﴿${item.text}﴾ [${item.surah.name}: ${ar(item.ayah)}]`
    : `${item.text}\n— ${item.bookName} (${ar(item.number)})${item.grade ? ` · ${item.grade.label}` : ''}`;

  if (act === 'copy') {
    try { await navigator.clipboard.writeText(text); toast('نُسخ النص ✓'); } catch { toast('تعذّر النسخ'); }
  }
  if (act === 'share') {
    const url = item.kind === 'quran' ? `https://quran.com/${item.surah.number}/${item.ayah}` : item.url;
    if (navigator.share) {
      try { await navigator.share({ text, url }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('نُسخ النص مع الرابط ✓'); } catch {}
    }
  }
});

let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-on'), 2200);
}

/* ---------- Daily ayah ---------- */
let dailyItem = null;
$('#dailyBtn').addEventListener('click', async () => {
  try {
    if (!dailyItem) {
      if (!engine.ready) toast('نجهّز المصحف… لحظات');
      dailyItem = await engine.call('daily');
    }
    el.dailyCard.innerHTML = cardHtml(dailyItem, 'daily');
    el.daily.showModal();
  } catch (err) {
    toast(err.message || 'تعذّر تحميل آية اليوم');
  }
});
$('#dailyClose').addEventListener('click', () => el.daily.close());
el.daily.addEventListener('click', (e) => { if (e.target === el.daily) el.daily.close(); });

/* ---------- Smooth anchor scroll ---------- */
$$('[data-scroll]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  $(a.getAttribute('href'))?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}));

addEventListener('scroll', () => document.body.classList.toggle('is-scrolled', scrollY > 30), { passive: true });

// Safari tints its top bar with theme-color: sky blue over the landscape, deep blue over the results.
const themeMeta = $('meta[name="theme-color"]');
function setSearching(on) {
  document.body.classList.toggle('is-searching', on);
  themeMeta.content = on ? '#1B2236' : '#36608A';
}

/* ---------- URL state ---------- */
function fromUrl() {
  const p = new URLSearchParams(location.search);
  const q = p.get('q');
  if (!q) {
    setSearching(false);
    el.results.hidden = true;
    document.title = 'سكينة · Sakinah — ابحث في القرآن الكريم والكتب الستة';
    return;
  }
  state.q = q;
  state.type = ['quran', 'hadith'].includes(p.get('type')) ? p.get('type') : 'all';
  state.book = p.get('book') || '';
  el.input.value = q;
  el.form.classList.add('has-value');
  $$('button', el.tabs).forEach((x) => x.classList.toggle('is-active', x.dataset.type === state.type));
  runSearch({ push: false });
}
addEventListener('popstate', fromUrl);

/* ==========================================================================
   Ambient motion
   ========================================================================== */

// Typewriter placeholder
(() => {
  const words = ['الرزق', 'السكينة', 'الصبر', 'الرحمة', 'التوبة', 'الجنة', 'الدعاء'];
  let w = 0, c = 0, dir = 1;
  const tick = () => {
    if (document.activeElement !== el.input && !el.input.value) {
      const word = words[w];
      c += dir;
      el.input.placeholder = `ابحث عن ${word.slice(0, c)}${dir > 0 ? '' : ''}…`;
      if (c >= word.length) { dir = -1; return setTimeout(tick, 1800); }
      if (c <= 0) { dir = 1; w = (w + 1) % words.length; return setTimeout(tick, 380); }
    }
    setTimeout(tick, dir > 0 ? 130 : 60);
  };
  if (!reduceMotion) setTimeout(tick, 2200);
})();

// Background parallax
(() => {
  if (reduceMotion) return;
  const img = $('.scene__img');
  let tx = 0, ty = 0, x = 0, y = 0;
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    tx = (e.clientX / innerWidth - 0.5) * -18;
    ty = (e.clientY / innerHeight - 0.5) * -12;
  });
  const loop = () => {
    x += (tx - x) * 0.04;
    y += (ty - y) * 0.04;
    img.style.setProperty('--px', `${x.toFixed(2)}px`);
    img.style.setProperty('--py', `${y.toFixed(2)}px`);
    requestAnimationFrame(loop);
  };
  loop();
})();

// Floating light dust
(() => {
  const canvas = $('#dust');
  if (reduceMotion || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  let w, h, dpr, parts = [];
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.width = innerWidth * dpr;
    h = canvas.height = innerHeight * dpr;
    const n = Math.round(Math.min(70, (innerWidth * innerHeight) / 22000));
    parts = Array.from({ length: n }, () => spawn(true));
  };
  const spawn = (anywhere) => ({
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : h + 20,
    r: (Math.random() * 1.6 + 0.5) * dpr,
    vy: -(Math.random() * 0.25 + 0.08) * dpr,
    vx: (Math.random() - 0.5) * 0.12 * dpr,
    a: Math.random() * Math.PI * 2,
    warm: Math.random() < 0.35,
  });
  const draw = () => {
    if (!document.hidden) {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.x += p.vx + Math.sin(p.a) * 0.15 * dpr;
        p.y += p.vy;
        p.a += 0.01;
        if (p.y < -20) Object.assign(p, spawn(false));
        const alpha = 0.35 + Math.sin(p.a * 2) * 0.25;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        const col = p.warm ? '236,255,140' : '255,255,255';
        g.addColorStop(0, `rgba(${col},${alpha})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    requestAnimationFrame(draw);
  };
  addEventListener('resize', resize);
  resize();
  draw();
})();

/* ---------- Boot ---------- */
try {
  const v = localStorage.getItem('sakinah:view');
  if (v === 'grid' || v === 'stack') state.view = v;
} catch {}
const heroImg = new Image();
heroImg.src = 'assets/hero-hd.jpg';
const ready = () => requestAnimationFrame(() => document.body.classList.add('is-ready'));
heroImg.decode ? heroImg.decode().then(ready, ready) : (heroImg.onload = ready);
setTimeout(ready, 600);
fromUrl();

// Warm up the search engine in the background so the first search feels instant.
el.input.addEventListener('focus', engine.start, { once: true });
setTimeout(() => (window.requestIdleCallback || setTimeout)(engine.start), 1500);
