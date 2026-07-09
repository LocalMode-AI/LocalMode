/**
 * Standalone static server for the prebuilt registry (`public/`). Run as a
 * SEPARATE process by portability-test.mjs so it can answer `shadcn add`'s
 * fetches while the harness blocks on `spawnSync`. (Serving from inside the
 * harness process deadlocks: spawnSync blocks the event loop, so an in-process
 * server never responds.)
 *
 * Args: <publicDir> <port>
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC_DIR = process.argv[2];
const PORT = Number(process.argv[3] || 4599);

const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const fp = path.join(PUBLIC_DIR, url);
    const data = await readFile(fp);
    res.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    });
    res.end(data);
  } catch {
    if (!res.headersSent) res.writeHead(404);
    res.end('not found');
  }
});

// Keep the process alive under cumulative load across many lanes: a client
// socket error (reset/hang-up) or a transient server error must NOT crash the
// process, or later lanes get ECONN failures instead of registry JSON.
server.on('clientError', (_err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
server.on('error', (err) => {
  console.error(`registry-server error (non-fatal): ${err?.message ?? err}`);
});
// The many parallel npm installs open a lot of sockets; allow generous
// keep-alive so accepted connections aren't dropped mid-run.
server.keepAliveTimeout = 60_000;
server.headersTimeout = 65_000;
server.maxConnections = 512;

server.listen(PORT, () => {
  // Signal readiness to the parent on stdout.
  console.log(`registry-server-ready ${PORT}`);
});

// Last-resort guards so an unexpected error never tears the server process down.
process.on('uncaughtException', (err) => {
  console.error(`registry-server uncaughtException (ignored): ${err?.message ?? err}`);
});
process.on('unhandledRejection', (err) => {
  console.error(`registry-server unhandledRejection (ignored): ${err}`);
});
