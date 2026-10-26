// Arabic text helpers: normalization for search, digit conversion.

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

// Normalize a single word (no spaces in the output).
function normWord(word) {
  return normalize(word).replace(/ /g, '');
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function toArabicDigits(n) {
  return String(n).replace(/\d/g, (d) => AR_DIGITS[d]);
}

module.exports = { normalize, normWord, toArabicDigits };
