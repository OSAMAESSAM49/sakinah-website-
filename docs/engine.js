// Sakinah — سكينة · search engine (runs in a Web Worker, fully in the browser)
// Loads the compact data in data/*.json, then answers { search, daily } requests from app.js.

/* ---------------------------------------------------------------- Arabic */

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ‌-‏﻿]/g;

function normalize(text) {
  return String(text || '')
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^ء-ي\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const normWord = (word) => normalize(word).replace(/ /g, '');

/* ---------------------------------------------------------------- Search */
// Light morphology: optional prefixes (و ف ب ل ك ال ...), verb prefixes (ي ت ن ا) and suffixes.

const SUFFIXES = new Set(['ه', 'ها', 'هم', 'هن', 'هما', 'كم', 'كما', 'كن', 'ك', 'نا', 'ي', 'ني', 'ات', 'ون', 'ين', 'ان', 'ا', 'وا', 'تم', 'ت', 'تها', 'ته', 'تك', 'تنا', 'تهم']);
const COMMON = new Set(['الله', 'لله', 'رسول', 'النبي']);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function stemsFor(word) {
  let base = word;
  if (base.startsWith('ال') && base.length - 2 >= 3) base = base.slice(2);
  const stems = [{ stem: base, penalty: 0 }];
  if (base.endsWith('ه') && base.length >= 4) stems.push({ stem: base.slice(0, -1), penalty: 1 });
  return stems;
}

function compileWord(word) {
  return stemsFor(word).map(({ stem, penalty }) => {
    const verb = stem.length >= 3 ? '([يتنا]?)' : '()';
    return {
      penalty,
      re: new RegExp(` ((?:[وف])?(?:بال|كال|فال|وال|لل|ال|ب|ل|ك|س)?)${verb}(${escape(stem)})([^ ]*)(?= )`, 'g'),
    };
  });
}

// Best score of one query word against a normalized text (0 = no match).
function scoreWord(patterns, text) {
  let best = 0;
  let count = 0;
  for (const { re, penalty } of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      count++;
      const verbPrefix = m[2];
      const suffix = m[4];
      let s;
      if (!suffix) s = verbPrefix ? 3 : 5;
      else if (SUFFIXES.has(suffix)) s = verbPrefix ? 2.5 : 4;
      else s = 1.5;
      s -= penalty;
      if (s > best) best = s;
    }
  }
  return best ? best + Math.min(count, 4) * 0.15 : 0;
}

function compileQuery(q) {
  const norm = normalize(q);
  const words = norm.split(' ').filter((w) => w.length >= 2);
  return { norm, words, patterns: words.map(compileWord) };
}

function scoreItem(query, item) {
  let total = 0;
  for (const p of query.patterns) {
    const s = scoreWord(p, item.norm);
    if (!s) return 0;
    total += s;
  }
  if (query.words.length > 1 && item.norm.includes(' ' + query.norm + ' ')) total += 6;
  else if (query.words.length > 1 && item.norm.includes(query.norm)) total += 3;
  return total;
}

// Indices (by whitespace split) of displayed words that match the query, for highlighting.
function highlightIndices(query, text) {
  const out = [];
  const patterns = query.words.length > 1 ? query.patterns.filter((_, i) => !COMMON.has(query.words[i])) : query.patterns;
  text.split(/\s+/).filter(Boolean).forEach((w, i) => {
    const n = ' ' + normWord(w) + ' ';
    if (n.length > 2 && patterns.some((p) => scoreWord(p, n) > 0)) out.push(i);
  });
  return out;
}

/* ------------------------------------------------------------------ Data */

const BOOKS = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah'];

function gradeTone(label) {
  if (!label) return 'neutral';
  if (/ضعيف|منكر|موضوع|باطل|شاذ|معلول/.test(label)) return 'daif';
  if (/^حسن|^إسناده حسن|^حسن الإسناد/.test(label)) return 'hasan';
  if (/صحيح|متواتر/.test(label)) return 'sahih';
  return 'neutral';
}

function hydrateQuran({ surahs, ayat }) {
  return ayat.map(([s, ayah, juz, page, text, plain], i) => {
    const [name, revelation, ayahCount] = surahs[s - 1];
    return {
      kind: 'quran',
      id: `q${i + 1}`,
      order: i + 1,
      surah: { number: s, name, revelation, ayahCount },
      ayah,
      juz,
      page,
      text,
      norm: ` ${plain} `,
    };
  });
}

// Display text is the word range [start, end) of the full text; computed lazily for results only.
function displayText(h) {
  return h.raw.split(/\s+/).filter(Boolean).slice(h.start, h.end).join(' ').replace(/^[\s‏.،]+/, '');
}

function hydrateHadith({ id, name, author, graders, rows }, bookIndex) {
  const sahihain = id === 'bukhari' || id === 'muslim';
  return rows.map(([hadithnumber, number, raw, start, end, narrator, grades]) => {
    const all = (grades || []).map(([g, label]) => ({ by: graders[g], label, tone: gradeTone(label) }));
    const h = {
      kind: 'hadith',
      id: `${id}-${hadithnumber}`,
      order: bookIndex * 100000 + hadithnumber,
      book: id,
      bookName: name,
      author,
      number,
      narrator: narrator || null,
      grade: sahihain ? { label: 'صحيح', by: 'من أحاديث الصحيحين', tone: 'sahih' } : all[0] || null,
      grades: all,
      url: `https://sunnah.com/${id}:${number}`,
      raw,
      start,
      end,
    };
    const text = displayText(h);
    h.textLength = text.length;
    h.norm = ` ${normalize(text)} `;
    return h;
  });
}

function publicItem(item, query) {
  const { norm, order, raw, start, end, textLength, ...rest } = item;
  if (item.kind === 'hadith') {
    const words = raw.split(/\s+/).filter(Boolean);
    rest.text = displayText(item);
    rest.fullText = start > 0 || end < words.length ? raw : null;
  }
  rest.hl = query ? highlightIndices(query, rest.text) : [];
  return rest;
}

/* ---------------------------------------------------------------- Engine */

class SearchEngine {
  constructor(quran, hadith) {
    this.quran = quran;
    this.hadith = hadith;
    this.cache = new Map();
  }

  run(q) {
    const key = normalize(q);
    if (this.cache.has(key)) return this.cache.get(key);
    const query = compileQuery(q);
    const rank = (list, bonus) =>
      list
        .map((item) => ({ item, score: scoreItem(query, item) }))
        .filter((r) => r.score > 0)
        .map((r) => ({ ...r, score: r.score + (bonus ? bonus(r.item) : 0) }))
        .sort((a, b) => b.score - a.score || a.item.order - b.item.order)
        .map((r) => r.item);

    const quran = query.words.length ? rank(this.quran) : [];
    const hadith = query.words.length
      ? rank(this.hadith, (h) => {
          const tone = h.grade && h.grade.tone;
          return (tone === 'sahih' ? 0.4 : tone === 'hasan' ? 0.2 : 0) - Math.min(h.textLength / 4000, 0.6);
        })
      : [];

    const result = { query, quran, hadith };
    this.cache.set(key, result);
    if (this.cache.size > 60) this.cache.delete(this.cache.keys().next().value);
    return result;
  }

  search({ q, type = 'all', book = '', offset = 0, limit = 24 }) {
    const { query, quran, hadith } = this.run(String(q || '').slice(0, 80));
    const books = {};
    for (const b of BOOKS) books[b] = 0;
    for (const h of hadith) books[h.book]++;

    const hadithList = book ? hadith.filter((h) => h.book === book) : hadith;
    let list;
    if (type === 'quran') list = quran;
    else if (type === 'hadith') list = hadithList;
    else {
      // Interleave so the carousel alternates between ayat and ahadith.
      list = [];
      const n = Math.max(quran.length, hadithList.length);
      for (let i = 0; i < n; i++) {
        if (quran[i]) list.push(quran[i]);
        if (hadithList[i]) list.push(hadithList[i]);
      }
    }

    return {
      q,
      words: query.words,
      type,
      book,
      offset,
      limit,
      total: list.length,
      counts: { all: quran.length + hadith.length, quran: quran.length, hadith: hadith.length, books },
      items: list.slice(offset, offset + limit).map((item) => publicItem(item, query)),
    };
  }

  daily() {
    const day = Math.floor(Date.now() / 86400000);
    return publicItem(this.quran[(day * 7919) % this.quran.length], null);
  }
}

/* ---------------------------------------------------------------- Worker */

if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof module === 'undefined') {
  const files = ['quran', ...BOOKS.map((b) => `hadith-${b}`)];
  let done = 0;

  const load = async (name) => {
    const res = await fetch(`data/${name}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    self.postMessage({ type: 'progress', loaded: ++done, total: files.length });
    return json;
  };

  const ready = Promise.all(files.map(load)).then(([quran, ...books]) => {
    const engine = new SearchEngine(hydrateQuran(quran), books.flatMap((b, i) => hydrateHadith(b, i)));
    self.postMessage({ type: 'ready' });
    return engine;
  });

  self.onmessage = async ({ data: { id, cmd, args } }) => {
    try {
      const engine = await ready;
      const result = cmd === 'daily' ? engine.daily() : engine.search(args || {});
      self.postMessage({ id, result });
    } catch (err) {
      self.postMessage({ id, error: 'تعذّر تحميل البيانات، تأكد من اتصالك بالإنترنت ثم أعد المحاولة.' });
    }
  };
} else if (typeof module !== 'undefined') {
  // Node (tests / tools): expose the engine without the worker wiring.
  module.exports = { SearchEngine, hydrateQuran, hydrateHadith, normalize, BOOKS };
}
