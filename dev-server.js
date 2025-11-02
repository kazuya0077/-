const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const portArg = process.argv.slice(2).find((value) => /^\d+$/.test(value));
const port = Number(portArg || process.env.PORT || 4173);
const root = process.cwd();

const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=UTF-8',
  '.gs': 'text/plain; charset=UTF-8'
};

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

function safeJoin(base, target) {
  const normalized = path
    .normalize(target)
    .replace(/^([.]{2}[\/\\])+/, '')
    .replace(/^\//, '');
  const targetPath = path.join(base, normalized);
  if (!targetPath.startsWith(base)) {
    return null;
  }
  return targetPath;
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  const pathname = decodeURIComponent(parsedUrl.pathname);
  const safePath = safeJoin(root, pathname);

  if (!safePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('Forbidden');
    return;
  }

  let filePath = safePath;

  fs.stat(filePath, (statErr, stats) => {
    if (!statErr && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        if (readErr.code === 'ENOENT') {
          const fallbackPath = path.join(root, 'index.html');
          fs.readFile(fallbackPath, (fallbackErr, fallbackContent) => {
            if (fallbackErr) {
              res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
              res.end('Not Found');
              return;
            }
            res.writeHead(200, { 'Content-Type': getContentType(fallbackPath) });
            res.end(fallbackContent);
          });
        } else {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
          res.end('Internal Server Error');
        }
        return;
      }

      res.writeHead(200, { 'Content-Type': getContentType(filePath) });
      res.end(content);
    });
  });
});

server.listen(port, () => {
  console.log(`🚀 Dev server running at http://localhost:${port}`);
});
