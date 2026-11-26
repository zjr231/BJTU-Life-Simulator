'use strict';
// Serve the game and its API on one loopback origin for local playtesting.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { openAccounts } = require('./npc-accounts.js');
const { openPlaythroughs } = require('./playthrough-store.js');
const { createService } = require('./npc-server.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pages = new Set(['index.html', ...Array.from(html.matchAll(/(?:src|href)="([^"?#]+)(?:\?[^"]*)?"/g), m => m[1])]);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wav': 'audio/wav' };

function servePage(req, res) {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html'; } catch {}
  const asset = /^assets\/(?:[\p{L}\p{N}_-]+\/)*[\p{L}\p{N}_.-]+\.(?:webp|jpg|png|svg|wav)$/u.test(name);
  if (!['GET', 'HEAD'].includes(req.method) || (!pages.has(name) && !asset)) return res.writeHead(404).end();
  const file = fs.createReadStream(path.join(root, name));
  file.on('error', () => { if (!res.headersSent) res.writeHead(404); res.end(); });
  file.on('open', () => {
    res.writeHead(200, { 'Content-Type': types[path.extname(name)], 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') { file.destroy(); res.end(); } else file.pipe(res);
  });
  res.on('close', () => file.destroy());
}

const data = path.join(os.homedir(), '.bjtu-life-preview');
const store = openAccounts(path.join(data, 'accounts.sqlite'));
const playthroughs = openPlaythroughs(path.join(data, 'playthroughs.sqlite'));
const server = createService({ store, playthroughs, servePage, apiKey: process.env.DEEPSEEK_API_KEY });
server.listen(Number(process.env.NPC_PORT || 8765), '127.0.0.1', () => {
  console.log('本机试玩 http://127.0.0.1:' + server.address().port + '/');
  console.log('试玩数据 ' + path.join(data, 'playthroughs.sqlite'));
});
