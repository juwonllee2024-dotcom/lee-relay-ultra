import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

http.createServer(async (req, res) => {
  try {
    const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let filePath = path.join(root, requestPath === '/' ? 'index.html' : requestPath);
    const info = await stat(filePath).catch(() => null);
    if (!info || info.isDirectory()) filePath = path.join(root, 'index.html');
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': types[path.extname(filePath)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String(error));
  }
}).listen(port, '0.0.0.0', () => console.log(`History Lab: http://127.0.0.1:${port}`));
