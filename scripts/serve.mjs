import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { build, projectRoot } from './build.mjs';

const production = process.argv.includes('--production');
const port = Number(process.env.PORT || 5173);
const output = path.join(projectRoot, 'dist');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.pdf': 'application/pdf', '.ico': 'image/x-icon' };
if (!production) await build();
// Serialize rebuilds so simultaneous requests never race to replace dist.
let pendingBuild = Promise.resolve();
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://preview');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(output, '.' + pathname);
    if (!file.startsWith(output + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    if (!production && pathname === '/index.html') {
      pendingBuild = pendingBuild.catch(() => {}).then(() => build());
      await pendingBuild;
    }
    if (!(await stat(file)).isFile()) { res.writeHead(404); return res.end('Not found'); }
    const contents = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : contents);
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(error.code === 'ENOENT' ? 'Not found' : `Preview error: ${error.message}`);
  }
}).listen(port, '0.0.0.0', () => console.log(`Research site: http://0.0.0.0:${port}${production ? '' : ' (refresh after editing to rebuild)'}`));
