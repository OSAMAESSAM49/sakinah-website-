// Cache-busting: adds a content hash (?v=…) to the site's CSS/JS links, so phones and installed
// apps always fetch the new files after an update instead of a stale cached copy.
// Run before every commit that changes docs/:  node tools/stamp.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DOCS = path.join(__dirname, '..', 'docs');
const read = (f) => fs.readFileSync(path.join(DOCS, f), 'utf8');
const write = (f, s) => fs.writeFileSync(path.join(DOCS, f), s);
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);

// Replaces `name` or `name?v=…` inside quotes with `name?v=<hash>`.
const stamp = (source, name, version) =>
  source.replace(new RegExp(`(["'])${name.replace('.', '\\.')}(\\?v=[0-9a-f]+)?\\1`, 'g'), `$1${name}?v=${version}$1`);

// engine.js is referenced from app.js, so stamp it first; then app.js and styles.css from index.html.
const engineV = hash(read('engine.js'));
write('app.js', stamp(read('app.js'), 'engine.js', engineV));

let html = read('index.html');
html = stamp(html, 'app.js', hash(read('app.js')));
html = stamp(html, 'styles.css', hash(read('styles.css')));
write('index.html', html);

console.log('  stamped:', html.match(/(styles\.css|app\.js)\?v=[0-9a-f]+/g).join('  '), ` engine.js?v=${engineV}`);
