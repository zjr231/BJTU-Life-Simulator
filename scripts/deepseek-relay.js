'use strict';
// 更新旧云函数时，已安装旧客户端也不能再通过通用 messages 接口消耗额度。
function retired() {
  return { statusCode: 410, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ error: '旧版对话服务已停用，请刷新游戏。' }), isBase64Encoded: false };
}
module.exports = { handler: retired, main: retired };
