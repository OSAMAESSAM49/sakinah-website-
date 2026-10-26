// Converts the raw Quran + hadith datasets in data/ into compact files the browser loads
// (docs/data/*.json). Run once after changing the data or lib/data.js:  node tools/build-data.js
const fs = require('fs');
const path = require('path');
const { loadQuran, analyzeHadith, buildGrades, BOOKS, DATA_DIR } = require('../lib/data');

const OUT = path.join(__dirname, '..', 'docs', 'data');

const write = (name, obj) => {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify(obj));
  console.log(`  ${name.padEnd(22)} ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // Quran: one row per ayah -> [surah, ayah, juz, page, text, plain]
  // `plain` (the undiacritized edition) is what the search matches against, exactly as on the server.
  const ayat = await loadQuran();
  const surahs = [];
  for (const a of ayat) surahs[a.surah.number - 1] ??= [a.surah.name, a.surah.revelation, a.surah.ayahCount];
  write('quran.json', {
    surahs,
    ayat: ayat.map((a) => [a.surah.number, a.ayah, a.juz, a.page, a.text, a.norm.trim()]),
  });

  // Hadith: one file per book. Each row keeps the full text once, plus the word range that is
  // displayed (from the companion onwards); the browser rebuilds display text + search index.
  for (const book of BOOKS) {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `ara-${book.id}.json`), 'utf8'));
    const graders = [];
    const rows = [];
    for (const h of raw.hadiths) {
      if (!h.text || !h.text.trim()) continue;
      const text = h.text.replace(/[‌-‏]/g, '');
      const a = analyzeHadith(h.text);
      const g = buildGrades(book.id, h.grades).all.map(({ by, label }) => {
        if (!graders.includes(by)) graders.push(by);
        return [graders.indexOf(by), label];
      });
      rows.push([
        Number(h.hadithnumber),
        Math.floor(Number(h.arabicnumber ?? h.hadithnumber)),
        text,
        a.start,
        a.end,
        a.narrator || 0,
        g.length ? g : 0,
      ]);
    }
    write(`hadith-${book.id}.json`, { id: book.id, name: book.name, author: book.author, graders, rows });
  }
  console.log('  ✓ done');
})();
