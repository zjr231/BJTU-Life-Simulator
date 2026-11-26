#!/usr/bin/env node
'use strict';
// 提交后把本次工作总结推送到飞书群自定义机器人。
// 由 .git/hooks/post-commit 在后台调用，失败只写日志，绝不影响提交结果。
//
// 配置：在仓库的 .git/feishu-webhook 里写两行（该文件不会被 git 跟踪）
//   第 1 行：群机器人 webhook 地址，形如 https://open.feishu.cn/open-apis/bot/v2/hook/xxxx
//   第 2 行（可选）：机器人「签名校验」的密钥，没开签名就留空
//
// 调试：
//   FEISHU_NOTIFY_DRY_RUN=1 node scripts/feishu-notify.js   # 只打印消息，不发送
//   FEISHU_NOTIFY_NO_AI=1 node scripts/feishu-notify.js     # 跳过 AI 总结，只发结构化信息
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const TAG = 'feishu-notify';
const AI_TIMEOUT_MS = 120000;
const SEND_TIMEOUT_MS = 10000;
const MAX_DIFF = 12000;

function log(message) { process.stderr.write('[' + TAG + '] ' + message + '\n'); }

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
}

function readConfig(root) {
  const file = path.join(root, '.git', 'feishu-webhook');
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim());
  const webhook = lines[0] || '';
  if (!/^https?:\/\//.test(webhook)) return null;
  return { webhook, secret: lines[1] || '' };
}

function commitInfo() {
  const info = {
    hash: git(['rev-parse', '--short', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    author: git(['log', '-1', '--format=%an']),
    when: git(['log', '-1', '--format=%ad', '--date=format:%Y-%m-%d %H:%M']),
    subject: git(['log', '-1', '--format=%s']),
    body: git(['log', '-1', '--format=%b'])
  };
  // 合并提交用 --first-parent 才能拿到相对主线的改动；仍为空时退回 diff-tree。
  let numstat = '';
  try { numstat = git(['show', '--numstat', '--format=', '--first-parent', 'HEAD']); } catch (_) {}
  if (!numstat) {
    try { numstat = git(['diff-tree', '--numstat', '-r', '--no-commit-id', '-m', 'HEAD']); } catch (_) {}
  }
  info.files = 0; info.added = 0; info.deleted = 0;
  for (const line of numstat.split('\n')) {
    if (!line.trim()) continue;
    const [added, deleted] = line.split('\t');
    info.files += 1;
    if (Number.isFinite(Number(added))) info.added += Number(added);
    if (Number.isFinite(Number(deleted))) info.deleted += Number(deleted);
  }
  try {
    info.diff = git(['show', '--format=', '--first-parent', '--unified=2', 'HEAD']).slice(0, MAX_DIFF);
  } catch (_) { info.diff = ''; }
  return info;
}

// 让本机 claude 命令读 diff 写两三句总结；不可用或超时就退回结构化信息。
function claudeSummary(root, info) {
  if (process.env.FEISHU_NOTIFY_NO_AI === '1' || !info.diff) return '';
  const prompt = '请用中文写 2~3 句话总结这次代码提交做了什么、影响哪些功能，150 字以内。'
    + '不要列表、不要客套、不要署名、不要重复提交说明原文。\n\n'
    + '提交说明：' + info.subject + '\n\n改动 diff（可能截断）：\n' + info.diff;
  try {
    // Windows 下 claude 是 .cmd 包装脚本，Node 不能直接执行，需要经 cmd.exe；
    // 提示词走 stdin，避免引号与换行在命令行里转义出错。
    const windows = process.platform === 'win32';
    const command = windows ? (process.env.ComSpec || 'cmd.exe') : 'claude';
    const args = windows ? ['/d', '/s', '/c', 'claude -p --output-format text'] : ['-p', '--output-format', 'text'];
    const output = execFileSync(command, args, {
      cwd: root, input: prompt, encoding: 'utf8', timeout: AI_TIMEOUT_MS, stdio: ['pipe', 'pipe', 'ignore']
    });
    return output.trim().replace(/\s+/g, ' ').slice(0, 400);
  } catch (error) {
    log('生成 AI 总结失败，改发结构化信息：' + error.message);
    return '';
  }
}

function buildText(project, info, summary) {
  const lines = [
    '【北交人生】代码提交',
    '项目：' + project + ' · 分支 ' + info.branch,
    '提交：' + info.hash + ' · ' + info.when + ' · ' + info.author,
    '说明：' + info.subject
  ];
  if (info.body) lines.push('详情：' + info.body.split('\n').filter(Boolean).slice(0, 3).join(' / ').slice(0, 300));
  lines.push('变更：' + info.files + ' 个文件，+' + info.added + ' / −' + info.deleted);
  if (summary) lines.push('总结：' + summary);
  return lines.join('\n');
}

async function send(config, text) {
  const payload = { msg_type: 'text', content: { text } };
  if (config.secret) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    payload.timestamp = timestamp;
    // 飞书签名：以 "时间戳\n密钥" 为 HMAC-SHA256 的密钥，空字符串为消息体，再 base64。
    payload.sign = crypto.createHmac('sha256', timestamp + '\n' + config.secret).update('').digest('base64');
  }
  const response = await fetch(config.webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
  });
  const data = await response.json().catch(() => ({}));
  const code = data && (data.code !== undefined ? data.code : data.StatusCode);
  if (!response.ok || (code !== undefined && code !== 0)) {
    throw new Error('飞书返回 ' + response.status + ' ' + JSON.stringify(data).slice(0, 200));
  }
}

(async () => {
  const root = git(['rev-parse', '--show-toplevel']);
  const config = readConfig(root);
  if (!config) {
    log('未配置 .git/feishu-webhook（或首行不是 http 地址），跳过通知');
    return;
  }
  const info = commitInfo();
  const text = buildText(path.basename(root), info, claudeSummary(root, info));
  if (process.env.FEISHU_NOTIFY_DRY_RUN === '1') {
    process.stdout.write(text + '\n');
    return;
  }
  await send(config, text);
  log('已推送本次提交总结到飞书群');
})().catch((error) => {
  // 后台钩子：失败只记日志，返回 0，避免影响 git。
  log('通知失败：' + (error && error.message ? error.message : error));
});
