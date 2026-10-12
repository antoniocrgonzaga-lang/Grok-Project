// Servidor estático mínimo, sem dependências: node server.mjs [porta] [--open]
// --open abre o jogo no navegador padrão assim que o servidor estiver no ar.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const args = process.argv.slice(2);
const OPEN = args.includes('--open');
const FIRST_PORT = Number(args.find((a) => /^\d+$/.test(a)) ?? process.env.PORT ?? 5173);
const MAX_PORT_ATTEMPTS = 10;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
};

function openBrowser(url) {
  const command =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try {
    spawn(command[0], command[1], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  } catch {
    // Sem navegador disponível: o endereço já foi impresso no terminal.
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let filePath = resolve(join(ROOT, normalize(decodeURIComponent(url.pathname))));
    if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 - arquivo não encontrado');
  }
});

// Se a porta estiver ocupada (outra cópia do jogo aberta, por exemplo), tenta as seguintes.
let port = FIRST_PORT;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && port < FIRST_PORT + MAX_PORT_ATTEMPTS - 1) {
    port += 1;
    server.listen(port);
    return;
  }
  console.error(`Não foi possível iniciar o servidor: ${err.message}`);
  process.exit(1);
});
server.on('listening', () => {
  const url = `http://localhost:${port}`;
  console.log(`NEON HYPERDRIVE em ${url}`);
  console.log('Pressione Ctrl+C para encerrar.');
  if (OPEN) openBrowser(url);
});
server.listen(port);
