// Sakinah — سكينة · local preview server.
// The site itself is fully static (docs/) and runs on GitHub Pages; this only serves it locally,
// because browsers block Web Workers and fetch() on file:// pages.  Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const SITE_DIR = path.join(__dirname, 'docs');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(SITE_DIR, rel));
    if (!file.startsWith(SITE_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not found');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
  })
  .listen(PORT, () => console.log(`\n  سكينة · Sakinah  →  http://localhost:${PORT}\n`));
