const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.includes('\0')) throw new Error('Invalid pathname');
  } catch {
    response.writeHead(400).end();
    return;
  }
  const requested = pathname === '/' ? '/index.html' : pathname;
  const publicPages = new Set(['index.html', 'about.html', 'contact.html', 'services.html', 'styles.css', 'layout.css', 'hero.css', 'about.css', 'contact.css', 'footer.css', 'services.css', 'capability-ticker.css', 'script.js', 'contact.js', 'services.js', 'hero-film.js', 'hero-scene.js', 'capability-ticker.js']);
  if (!publicPages.has(requested.slice(1)) && !/^\/assets\/(?!.*(?:^|\/)\.)[^\\]+$/.test(requested)) {
    response.writeHead(404).end('Not found');
    return;
  }
  const filePath = path.resolve(root, `.${requested}`);
  const relativePath = path.relative(root, filePath);
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404).end(request.method === 'HEAD' ? undefined : 'Not found');
      return;
    }
    const headers = {
      'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Content-Length': stats.size,
    };
    let status = 200;
    let start = 0;
    let end = stats.size - 1;
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      let valid = Boolean(match && (match[1] || match[2]) && stats.size > 0);
      if (valid) {
        if (!match[1]) {
          const suffix = Number(match[2]);
          valid = Number.isSafeInteger(suffix) && suffix > 0;
          start = Math.max(0, stats.size - suffix);
        } else {
          start = Number(match[1]);
          const requestedEnd = match[2] ? Number(match[2]) : end;
          valid = Number.isSafeInteger(start) && Number.isSafeInteger(requestedEnd)
            && start < stats.size && start <= requestedEnd;
          end = Math.min(requestedEnd, end);
        }
      }
      if (!valid) {
        response.writeHead(416, {
          ...headers,
          'Content-Range': `bytes */${stats.size}`,
          'Content-Length': 0,
        }).end();
        return;
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;
      headers['Content-Length'] = end - start + 1;
    }
    response.writeHead(status, headers);
    if (request.method === 'HEAD' || stats.size === 0) {
      response.end();
      return;
    }
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  });
}).listen(port, '127.0.0.1', function () {
  console.log(`ELTONEX preview: http://127.0.0.1:${this.address().port}`);
});
