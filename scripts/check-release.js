'use strict';

// Checks the static release without npm dependencies or changing Pages settings.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const scripts = ['config.js', 'rng.js', 'state-validation.js', 'game.js', 'save.js', 'audio.js', 'sms.js', 'app.js'];
const files = new Set(['index.html', 'styles.css', '.nojekyll', ...scripts]);

function localReference(reference, from) {
  if (!reference || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) return;
  if (reference.startsWith('/')) throw new Error('资源必须使用相对路径以支持 Pages 子目录：' + reference);
  const relative = path.posix.normalize(path.posix.join(path.posix.dirname(from), reference.split(/[?#]/)[0]));
  if (relative.startsWith('../')) throw new Error('资源超出发布目录：' + reference);
  files.add(relative);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--url')) throw new Error('用法：node scripts/check-release.js [--url https://站点/项目/]');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) localReference(match[1], 'index.html');
  for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) localReference(match[1], 'styles.css');
  const loaded = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match => match[1]);
  if (JSON.stringify(loaded) !== JSON.stringify(scripts)) throw new Error('运行脚本的加载顺序与接口约定不一致');
  for (const file of files) {
    let directory = root;
    for (const segment of file.split('/')) {
      if (!fs.readdirSync(directory).includes(segment)) throw new Error('资源缺失或大小写不一致：' + file);
      directory = path.join(directory, segment);
    }
    if (!fs.statSync(directory).isFile()) throw new Error('资源不是文件：' + file);
    if (file.endsWith('.js')) new vm.Script(fs.readFileSync(directory, 'utf8'), { filename: file });
  }
  console.log('本地发布检查通过：' + files.size + ' 个文件，资源路径、大小写和脚本语法/顺序正确。');
  if (args.length) {
    const base = new URL(args[1]);
    if (!['https:', 'http:'].includes(base.protocol) || base.search || base.hash) throw new Error('请提供无查询参数的 HTTP/HTTPS 站点目录地址');
    if (!base.pathname.endsWith('/')) base.pathname += '/';
    for (const file of files) {
      // .nojekyll controls hosting; it need not be served as a public resource.
      if (file === '.nojekyll') continue;
      const response = await fetch(new URL(file, base), { signal: AbortSignal.timeout(15000), cache: 'no-store' });
      if (!response.ok) throw new Error('线上资源不可用：' + file + ' HTTP ' + response.status);
      const remote = Buffer.from(await response.arrayBuffer());
      const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
      if (digest(remote) !== digest(fs.readFileSync(path.join(root, file)))) throw new Error('线上文件与本地待验收版本不一致：' + file);
    }
    console.log('线上资源检查通过：所有公开运行文件与当前本地版本逐字节一致；交互和读档仍需浏览器验收。');
  }
}
main().catch(error => { console.error('发布检查失败：' + error.message); process.exitCode = 1; });
