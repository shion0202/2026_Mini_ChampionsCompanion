import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
const root = resolve(
  fileURLToPath(new URL('../', import.meta.url)),
  process.argv.includes('--dist') ? 'dist' : '.',
);
const portArg = process.argv.indexOf('--port');
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 4173;
const host = process.argv.includes('--host') ? '0.0.0.0' : '127.0.0.1';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    // Serve only app assets, never repository metadata or local project files.
    if (
      !/^(index\.html|manifest\.webmanifest|sw\.js|src\/[\w.-]+\.(js|css)|public\/(data|icons)\/[\w.-]+\.(json|svg|png|txt))$/.test(
        relative,
      )
    ) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const file = resolve(root, relative);
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
server.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`Champions Companion: http://localhost:${port}`);
  if (host === '0.0.0.0') {
    for (const addresses of Object.values(networkInterfaces()))
      for (const address of addresses ?? []) {
        if (address.family === 'IPv4' && !address.internal)
          console.log(`LAN preview: http://${address.address}:${port}`);
      }
    console.log('LAN HTTP supports viewing. Install/offline requires HTTPS or localhost.');
  }
});
