// Zero-dependency static file server with PWA headers
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html;charset=utf-8',
  '.js':   'application/javascript;charset=utf-8',
  '.css':  'text/css;charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

http.createServer((req, res) => {
  let filePath = path.join(PUBLIC, req.url === '/' ? 'index.html' : req.url);
  
  // Security: ensure we don't escape public dir
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403); res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback: serve index.html for unknown paths
      fs.readFile(path.join(PUBLIC, 'index.html'), (err2, data2) => {
        if (err2) { res.writeHead(404); res.end('Not Found'); return; }
        res.writeHead(200, {
          'Content-Type': 'text/html;charset=utf-8',
          'Service-Worker-Allowed': '/',
          'Cache-Control': 'no-cache',
        });
        res.end(data2);
      });
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=3600',
      'Service-Worker-Allowed': '/',
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`\n  ✅ PWA 服务已启动`);
  console.log(`  📱 http://localhost:${PORT}`);
  console.log(`  🌐 手机在同一网络访问上述地址`);
  console.log(`  🏠 在 Safari 中打开后，点「分享→添加到主屏幕」\n`);
});
