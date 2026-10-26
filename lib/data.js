// Downloads (once) and loads the Quran and the six hadith books into memory.
const fs = require('fs');
const path = require('path');
const { normalize, normWord } = require('./arabic');

const DATA_DIR = path.join(__dirname, '..', 'data');

const QURAN_SOURCES = {
  'quran-simple': 'https://api.alquran.cloud/v1/quran/quran-simple',
  'quran-simple-clean': 'https://api.alquran.cloud/v1/quran/quran-simple-clean',
};

const HADITH_CDN = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';

const BOOKS = [
  { id: 'bukhari', name: 'صحيح البخاري', author: 'الإمام البخاري' },
  { id: 'muslim', name: 'صحيح مسلم', author: 'الإمام مسلم' },
  { id: 'abudawud', name: 'سنن أبي داود', author: 'الإمام أبو داود' },
  { id: 'tirmidhi', name: 'جامع الترمذي', author: 'الإمام الترمذي' },
  { id: 'nasai', name: 'سنن النسائي', author: 'الإمام النسائي' },
  { id: 'ibnmajah', name: 'سنن ابن ماجه', author: 'الإمام ابن ماجه' },
];

async function ensureFile(file, url) {
  const full = path.join(DATA_DIR, file);
  if (fs.existsSync(full) && fs.statSync(full).size > 1000) return full;
  console.log(`  ↓ downloading ${file} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(full, buf);
  return full;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const stripMarks = (s) => String(s).normalize("NFC").replace(/ٱ/g, "ا").replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "").trim();

// "أَبِي هُرَيْرَةَ" (genitive after عن) -> "أبو هريرة"
function cleanNarrator(parts) {
  const words = parts.map(stripMarks).filter(Boolean);
  if (!words.length) return null;
  if (/^[أا]ب[يا]$/.test(words[0])) words[0] = 'أبو';
  return words.join(' ');
}

/* ---------------------------------------------------------------- Quran */

async function loadQuran() {
  const simple = readJson(await ensureFile('quran-simple.json', QURAN_SOURCES['quran-simple']));
  const clean = readJson(await ensureFile('quran-simple-clean.json', QURAN_SOURCES['quran-simple-clean']));

  const ayat = [];
  simple.data.surahs.forEach((surah, si) => {
    const cleanSurah = clean.data.surahs[si];
    surah.ayahs.forEach((ayah, ai) => {
      let text = ayah.text.replace(/﻿/g, '');
      let plain = cleanSurah.ayahs[ai].text.replace(/﻿/g, '');
      // The first ayah of each surah (except Al-Fatiha) carries the basmala as a prefix.
      if (surah.number !== 1 && ayah.numberInSurah === 1 && normWord(text.split(/\s+/)[0]) === 'بسم') {
        text = text.split(/\s+/).slice(4).join(' ');
        plain = plain.split(/\s+/).slice(4).join(' ');
      }
      ayat.push({
        kind: 'quran',
        id: `q${ayah.number}`,
        order: ayah.number,
        surah: {
          number: surah.number,
          name: stripMarks(surah.name).replace(/^سورة\s*/, ''),
          englishName: surah.englishName,
          revelation: surah.revelationType === 'Meccan' ? 'مكية' : 'مدنية',
          ayahCount: surah.ayahs.length,
        },
        ayah: ayah.numberInSurah,
        juz: ayah.juz,
        page: ayah.page,
        text,
        norm: ' ' + normalize(plain) + ' ',
      });
    });
  });
  return ayat;
}

/* --------------------------------------------------------------- Hadith */

const GRADER_AR = {
  'Al-Albani': 'الألباني',
  'Shuaib Al Arnaut': 'شعيب الأرناؤوط',
  'Bashar Awad Maarouf': 'بشار عواد معروف',
  'Ahmad Muhammad Shakir': 'أحمد شاكر',
  'Muhammad Muhyi Al-Din Abdul Hamid': 'محيي الدين عبد الحميد',
  'Abu Ghuddah': 'أبو غدة',
  'Muhammad Fouad Abd al-Baqi': 'محمد فؤاد عبد الباقي',
};
const GRADER_PRIORITY = ['Al-Albani', 'Shuaib Al Arnaut', 'Bashar Awad Maarouf', 'Ahmad Muhammad Shakir', 'Abu Ghuddah', 'Muhammad Muhyi Al-Din Abdul Hamid'];

const GRADE_WORDS = {
  sahih: 'صحيح', hasan: 'حسن', daif: 'ضعيف', very: 'جدا', shadh: 'شاذ', munkar: 'منكر',
  mawdu: 'موضوع', muquf: 'موقوف', mauquf: 'موقوف', maqtu: 'مقطوع', mutawatir: 'متواتر',
  mursal: 'مرسل', batil: 'باطل', malool: 'معلول', lighairihi: 'لغيره', matn: 'المتن',
};

function translateGrade(g) {
  const s = String(g || '').trim();
  if (!s || s === '-') return null;
  const lower = s.toLowerCase();
  const isnad = /\b(isnaad|sanad)\b/.test(lower);
  const words = lower
    .replace(/\b(isnaad|sanad|hadith)\b/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => GRADE_WORDS[w])
    .filter(Boolean);
  if (!words.length) return null;
  // "Daif Isnaad" -> "ضعيف الإسناد" ; "Isnaad Sahih" -> "إسناده صحيح"
  if (isnad) {
    return lower.startsWith('isnaad') || lower.startsWith('sanad')
      ? `إسناده ${words.join(' ')}`
      : `${words[0]} الإسناد${words.length > 1 ? ' ' + words.slice(1).join(' ') : ''}`;
  }
  return words.join(' ');
}

function gradeTone(label) {
  if (!label) return 'neutral';
  if (/ضعيف|منكر|موضوع|باطل|شاذ|معلول/.test(label)) return 'daif';
  if (/^حسن|^إسناده حسن|^حسن الإسناد/.test(label)) return 'hasan';
  if (/صحيح|متواتر/.test(label)) return 'sahih';
  return 'neutral';
}

function buildGrades(book, raw) {
  if (book === 'bukhari' || book === 'muslim') {
    return { main: { label: 'صحيح', by: 'من أحاديث الصحيحين', tone: 'sahih' }, all: [] };
  }
  const all = (raw || [])
    .filter((g) => GRADER_AR[g.name])
    .map((g) => ({ key: g.name, by: GRADER_AR[g.name], label: translateGrade(g.grade) }))
    .filter((g) => g.label);
  all.sort((a, b) => GRADER_PRIORITY.indexOf(a.key) - GRADER_PRIORITY.indexOf(b.key));
  const top = all[0];
  return {
    main: top ? { label: top.label, by: top.by, tone: gradeTone(top.label) } : null,
    all: all.map(({ by, label }) => ({ by, label, tone: gradeTone(label) })),
  };
}

// Words that introduce the next narrator in a chain (normalized forms).
const CHAIN_MARKERS = new Set(['عن', 'سمعت', 'حدثني', 'حدثنا', 'اخبرنا', 'اخبرني', 'حدثتني', 'اخبرتني', 'حدثه', 'اخبره', 'انبانا']);
const NAME_STOPS = new Set([
  'قال', 'قالت', 'قالا', 'ان', 'انه', 'انها', 'انهم', 'يقول', 'تقول', 'رضي', 'يحدث', 'حدث', 'سال', 'سالت',
  'سمع', 'عن', 'كان', 'كانت', 'كنا', 'كنت', 'يرفعه', 'رفعه', 'اذا', 'اخبره', 'حدثه', 'في', 'انه', 'قام', 'جاء',
  'يبلغ', 'بلغ', 'رواه', 'به', 'نحوه', 'مثله', 'قالوا', 'يخبر', 'اخبر',
]);
const BAD_NAMES = new Set(['ابيه', 'ابيها', 'جده', 'امه', 'رجل', 'رجلا', 'النبي', 'رسول', 'ناسا', 'امراه']);
const AFTER_NAME = new Set(['قال', 'قالت', 'قالا', 'حدثه', 'اخبره', 'يقول', 'تقول', 'حدثهم', 'اخبرهم', 'رضي', 'يحدث', 'حدثني', 'اخبرني']);

function isProphetAt(norm, i) {
  const w = norm[i];
  if (!w) return false;
  if (['النبي', 'للنبي', 'بالنبي', 'والنبي', 'فالنبي'].includes(w)) return true;
  if (['رسول', 'برسول', 'لرسول', 'ورسول', 'فرسول', 'يارسول'].includes(w) && ['الله', 'لله'].includes(norm[i + 1])) return true;
  if (w === 'صلي' && norm[i + 1] === 'الله' && norm[i + 2] === 'عليه') return true;
  return false;
}

// Splits a hadith into: narrator (companion), the displayed text (from narrator onwards)
// and the searchable normalized text (excluding most of the chain to avoid matching names).
function analyzeHadith(text) {
  const orig = text.replace(/[‌-‏]/g, '').split(/\s+/).filter(Boolean);
  const norm = orig.map(normWord);

  let p = -1;
  for (let i = 0; i < norm.length; i++) if (isProphetAt(norm, i)) { p = i; break; }

  let marker = -1;
  if (p > 0) {
    for (let i = p - 1; i >= 0; i--) if (CHAIN_MARKERS.has(norm[i])) { marker = i; break; }
  }

  const readName = (from) => {
    const parts = [];
    let i = from;
    for (; i < Math.min(orig.length, from + 7); i++) {
      if (!norm[i] || NAME_STOPS.has(norm[i])) break;
      const hasComma = /[،,]/.test(orig[i]);
      parts.push(orig[i].replace(/[،,.:؛‏"«»]/g, ''));
      if (hasComma) { i++; break; }
    }
    return { parts, next: i };
  };

  let narrator = null;
  if (marker >= 0) {
    const first = readName(marker + 1);
    if (first.parts.length && first.parts.length <= 6 && !BAD_NAMES.has(norm[marker + 1])) narrator = first.parts;
    // "عن أبي سلمة أن أبا هريرة قال ..." -> the companion is the one after "أن" / "سمع".
    for (let i = first.next; i < p; i++) {
      if (!['ان', 'سمع', 'سمعت'].includes(norm[i])) continue;
      const cand = readName(i + 1);
      const after = norm[cand.next] || '';
      if (cand.parts.length && cand.parts.length <= 6 && !BAD_NAMES.has(norm[i + 1]) && AFTER_NAME.has(after)) narrator = cand.parts;
    }
  }
  narrator = narrator ? cleanNarrator(narrator) : null;

  // Trim Tirmidhi-style commentary that follows the hadith ("قال أبو عيسى ...").
  let end = orig.length;
  for (let i = Math.max(marker, 0) + 5; i < norm.length - 2; i++) {
    if (norm[i] === 'قال' && norm[i + 1] === 'ابو' && norm[i + 2] === 'عيسي') { end = i; break; }
  }

  const start = marker >= 0 ? marker : 0;
  const display = orig.slice(start, end).join(' ').replace(/^[\s‏.،]+/, '');
  const searchNorm = ' ' + norm.slice(start, end).filter(Boolean).join(' ') + ' ';
  return { narrator, display, searchNorm, start, end, trimmed: start > 0 || end < orig.length };
}

async function loadHadith() {
  const all = [];
  for (const [bi, book] of BOOKS.entries()) {
    const file = await ensureFile(`ara-${book.id}.json`, `${HADITH_CDN}/ara-${book.id}.min.json`);
    const data = readJson(file);
    for (const h of data.hadiths) {
      if (!h.text || !h.text.trim()) continue;
      const number = Math.floor(Number(h.arabicnumber ?? h.hadithnumber));
      const a = analyzeHadith(h.text);
      const grades = buildGrades(book.id, h.grades);
      all.push({
        kind: 'hadith',
        id: `${book.id}-${h.hadithnumber}`,
        order: bi * 100000 + Number(h.hadithnumber),
        book: book.id,
        bookName: book.name,
        author: book.author,
        number,
        narrator: a.narrator,
        text: a.display,
        fullText: a.trimmed ? h.text.replace(/[‌-‏]/g, '') : null,
        grade: grades.main,
        grades: grades.all,
        url: `https://sunnah.com/${book.id}:${number}`,
        norm: a.searchNorm,
      });
    }
  }
  return all;
}

module.exports = { loadQuran, loadHadith, analyzeHadith, buildGrades, BOOKS, DATA_DIR };
