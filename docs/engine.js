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
// Light morphology: a query word matches a whole word of the text, allowing only what Arabic attaches
// to it — proclitics (و ف ب ل ك ال ...), verb prefixes (ي ت ن ا) and known endings (pronouns,
// plurals, verb endings). So «رزق» finds رزقناهم / يرزقه, but «أم» no longer finds أمية / أمر / أمام.

// Endings come in Arabic order: an inflection (plural, dual, verb ending) then an attached pronoun.
const INFLECTIONS = new Set(['ات', 'ون', 'ين', 'ان', 'ا', 'وا', 'تم', 'ت', 'نا', 'ي', 'هات']);
const PRONOUNS = new Set(['ه', 'ها', 'هم', 'هن', 'هما', 'كم', 'كما', 'كن', 'ك', 'نا', 'ي', 'ني']);
const SUFFIXES = new Set([...INFLECTIONS, ...PRONOUNS]);
const COMMON = new Set(['الله', 'لله', 'رسول', 'النبي']);
const KEEP_AL = new Set(['الله', 'اللهم', 'الذي', 'التي', 'الذين', 'اللاتي', 'اللائي']);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// An ending is valid when it is empty, one known ending, or an inflection + a pronoun
// (رزق + نا + هم ✓) — but not arbitrary letters (بُرْهان is not بر + ه + ان).
function isEnding(s) {
  if (!s || SUFFIXES.has(s)) return true;
  for (let i = 1; i < s.length; i++) if (INFLECTIONS.has(s.slice(0, i)) && PRONOUNS.has(s.slice(i))) return true;
  return false;
}

function stemsFor(word) {
  let base = word;
  if (base.startsWith('ال') && base.length - 2 >= 2 && !KEEP_AL.has(base)) base = base.slice(2);
  const stems = [{ stem: base, penalty: 0 }];
  // ة turns into ت before an ending (رحمة → رحمته، جنة → جنات), so also try the stem without it.
  // A three-letter root also brings its verbs (توبة → يتوب، توبوا); longer or shorter stems only
  // take the ت forms, so سكينة doesn't find سِكِّين and جنة doesn't find جنون.
  if (base.endsWith('ه') && base.length >= 4) {
    const stem = base.slice(0, -1);
    stems.push({ stem, penalty: 1, needsT: stem.length !== 3 });
  }
  return stems;
}

function compileWord(word) {
  return stemsFor(word).map(({ stem, penalty, needsT }) => {
    const verb = stem.length >= 3 ? '([يتنا]?)' : '()';
    return {
      stem,
      penalty,
      needsT,
      re: new RegExp(` ((?:[وف])?(?:بال|كال|فال|وال|لل|ال|ب|ل|ك|س)?)${verb}(${escape(stem)})([^ ]*)(?= )`, 'g'),
    };
  });
}

// Best score of one query word against a normalized text (0 = no match).
function scoreWord(patterns, text) {
  let best = 0;
  let count = 0;
  for (const { re, penalty, needsT, stem } of patterns) {
    const short = stem.length <= 2;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const proclitic = m[1];
      const verbPrefix = m[2];
      const suffix = m[4];
      if (!isEnding(suffix) || (needsT && !/^(ت|ات)/.test(suffix))) continue;
      // A verb prefix never follows ال (اليدين is not ال + ي + دين).
      if (verbPrefix && /ال|لل/.test(proclitic)) continue;
      // Two-letter words: a lone ب ك ل س in front is almost always part of another word (كَبِّر ≠ ك + بر).
      if (short && /^[وف]?[بكلس]$/.test(proclitic)) continue;
      count++;
      let s;
      if (!suffix) s = verbPrefix ? 3 : 5;
      else if (SUFFIXES.has(suffix)) s = verbPrefix ? 2.5 : 4;
      else s = verbPrefix ? 2 : 3;
      s -= penalty;
      if (s > best) best = s;
    }
  }
  return best ? best + Math.min(count, 4) * 0.15 : 0;
}

/* ---------------------------------------------------------------- Senses */
// Some words are written the same but mean different things; the diacritics in the text tell
// them apart. Each option tests the vowelled word (with its proclitics) and keeps only that meaning.

const H = '[\\u064B-\\u0652]*'; // any harakat between two letters
const FATHA = '\\u064E';
const DAMMA = '\\u064F';
const KASRA = '\\u0650';
const SHADDA = '\\u0651';
const SUKUN = '\\u0652';
const re = (s) => new RegExp(s);

const SENSES = {
  ام: {
    word: 'أم',
    fallback: 'mother',
    options: [
      // أُمّ with shadda, but not أُمَّة / أُمَّتي (nation) or الأُمِّيّ (unlettered)
      { id: 'mother', label: 'الأُمّ (الوالدة)', re: re(`أ${H}${DAMMA}${H}م${H}${SHADDA}(?!${H}(?:ة|ت|ي${H}${SHADDA}))`) },
      { id: 'or', label: 'أَمْ (أداة عطف)', re: re(`^[وف]?${H}أ${H}${FATHA}${H}م[\\u064E\\u0650\\u0652]?$`) },
    ],
  },
  دين: {
    word: 'الدين',
    fallback: 'religion',
    options: [
      { id: 'religion', label: 'الدِّين (الإسلام والطاعة)', re: re(`د${H}${KASRA}${H}ي`) },
      { id: 'debt', label: 'الدَّيْن (القرض)', re: re(`د${H}${FATHA}${H}ي`) },
    ],
  },
  جنه: {
    word: 'الجنة',
    fallback: 'paradise',
    options: [
      { id: 'paradise', label: 'الجَنَّة (دار النعيم)', re: re(`ج${H}${FATHA}${H}ن`) },
      { id: 'jinn', label: 'الجِنَّة (الجن)', re: re(`ج${H}${KASRA}${H}ن`) },
      { id: 'shield', label: 'الجُنَّة (الوقاية)', re: re(`ج${H}${DAMMA}${H}ن`) },
    ],
  },
  // All three meanings carry a shadda on the ر (بِرّ / بَرّ / بُرّ) — unlike بَرِئ، وَبَرَة، بُرَة.
  بر: {
    word: 'البر',
    fallback: 'righteousness',
    options: [
      { id: 'righteousness', label: 'البِرّ (الإحسان والطاعة)', re: re(`ب${H}${KASRA}${H}ر${H}${SHADDA}`) },
      { id: 'land', label: 'البَرّ (اليابسة · البارّ)', re: re(`ب${H}${FATHA}${H}ر${H}${SHADDA}`) },
      { id: 'wheat', label: 'البُرّ (القمح)', re: re(`ب${H}${DAMMA}${H}ر${H}${SHADDA}`) },
    ],
  },
  علم: {
    word: 'العلم',
    fallback: 'knowledge',
    options: [
      { id: 'knowledge', label: 'العِلْم (المعرفة)', re: re(`ع${H}${KASRA}${H}ل${H}${SUKUN}`) },
      { id: 'verb', label: 'عَلِمَ · يَعْلَم (الفعل)', re: re(`ع${H}[${FATHA}${DAMMA}]`) },
    ],
  },
  ملك: {
    word: 'الملك',
    fallback: 'all',
    options: [
      { id: 'dominion', label: 'المُلْك (السلطان)', re: re(`م${H}${DAMMA}${H}ل${H}${SUKUN}`) },
      { id: 'king', label: 'المَلِك (الحاكم)', re: re(`م${H}${FATHA}${H}ل${H}${KASRA}`) },
      { id: 'angel', label: 'مَلَك · مَلَكَ', re: re(`م${H}${FATHA}${H}ل${H}${FATHA}`) },
    ],
  },
};

// true / false by the diacritics; null when the word carries no harakat at all (can't tell).
function senseVerdict(sense, word) {
  if (!/[ً-ْ]/.test(word)) return null;
  return sense.re.test(word);
}

/* ----------------------------------------------------------------- Query */

function compileQuery(q, senses = {}) {
  const norm = normalize(q);
  const words = norm.split(' ').filter((w) => w.length >= 2);
  const terms = words.map((word) => {
    const patterns = compileWord(word);
    const key = patterns[0].stem;
    const entry = SENSES[key] || null;
    const choice = entry ? (entry.options.some((o) => o.id === senses[key]) || senses[key] === 'all' ? senses[key] : entry.fallback) : null;
    const sense = entry && choice !== 'all' ? entry.options.find((o) => o.id === choice) : null;
    return { word, key, patterns, entry, choice, sense };
  });
  return { norm, words, terms };
}

// The words of an item as displayed (vowelled), to check meanings and to highlight.
function wordsOf(item) {
  return (item.kind === 'quran' ? item.text : displayText(item)).split(/\s+/).filter(Boolean);
}

function scoreTerm(term, item) {
  const s = scoreWord(term.patterns, item.norm);
  if (!s || !term.sense) return s;
  // Ambiguous word: score only the occurrences whose vowels carry the chosen meaning.
  let best = 0;
  let count = 0;
  for (const w of wordsOf(item)) {
    const n = ` ${normWord(w)} `;
    if (!n.includes(term.patterns[term.patterns.length - 1].stem)) continue;
    const ws = scoreWord(term.patterns, n);
    if (!ws) continue;
    const v = senseVerdict(term.sense, w);
    if (v === false) continue;
    count++;
    best = Math.max(best, ws - (v === null ? 1.5 : 0));
  }
  return best ? best + Math.min(count, 4) * 0.15 : 0;
}

function scoreItem(query, item) {
  let total = 0;
  for (const term of query.terms) {
    const s = scoreTerm(term, item);
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
  const terms = query.words.length > 1 ? query.terms.filter((t) => !COMMON.has(t.word)) : query.terms;
  text.split(/\s+/).filter(Boolean).forEach((w, i) => {
    const n = ' ' + normWord(w) + ' ';
    if (n.length <= 2) return;
    const hit = terms.some((t) => scoreWord(t.patterns, n) > 0 && (!t.sense || senseVerdict(t.sense, w) !== false));
    if (hit) out.push(i);
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

  run(q, senses) {
    const key = `${normalize(q)}|${JSON.stringify(senses || {})}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const query = compileQuery(q, senses);
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

  search({ q, type = 'all', book = '', offset = 0, limit = 24, senses = {} }) {
    const { query, quran, hadith } = this.run(String(q || '').slice(0, 80), senses);
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
      // Ambiguous words in the query and their meanings, so the page can offer a choice.
      senses: query.terms
        .filter((t) => t.entry)
        .map((t) => ({
          key: t.key,
          word: t.entry.word,
          active: t.choice,
          options: [...t.entry.options.map(({ id, label }) => ({ id, label })), { id: 'all', label: 'كل المعاني' }],
        })),
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
