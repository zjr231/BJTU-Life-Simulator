# NPC 在线对话接入说明

周宁、陈老师和林夏共用本站 `/api/npc-chat`。玩家首次主动聊天时，浏览器自动向本站领取或复用对话会话，随后发送消息。会话由 HttpOnly Cookie 保存 30 天。已有有效会话沿用原身份、额度和暂停状态。首次发言前的自动相遇使用本地台词。

## 已部署站点填写或更换密钥

用服务器管理员账号打开 NPC 服务的配置文件。

```bash
sudoedit /etc/bjtu-npc.env
```

在文件中找到 `DEEPSEEK_API_KEY=`，把密钥填到等号右侧并保存。每次新增或更换密钥，只需重启服务。

```bash
sudo systemctl restart bjtu-npc
systemctl is-active bjtu-npc
```

看到 `active` 后，直接给已认识的人物发一条消息。在浏览器开发者工具的「网络」面板中，确认这次 `POST /api/npc-chat` 返回 `200`，响应包含 `reply`。这样可以确认真实模型调用已接通。密钥只保存在服务器上，前端、部署包和 Git 提交均无需更新。[DeepSeek 密钥管理](https://platform.deepseek.com/api_keys)

## 站点部署与旧入口迁移

当前 ECS 站点可直接使用公网 IPv4 的 HTTPS 地址。安全组需要允许 TCP 443 供玩家访问，并保留 TCP 80 供证书签发、续期和旧链接跳转。游戏页面、聊天和存档请求都应使用 HTTPS。

首次切换时，管理员在 root 终端运行 `python3 scripts/enable-game-https.py prepare 公网IPv4`。脚本通过 Certbot 的官方 Snap 安装包申请短期 IP 证书，相应命令会接受 Let’s Encrypt 的订户协议。从服务器外部访问 `https://公网IPv4/.well-known/bjtu-https-ready`，确认证书受信任且返回 `bjtu-https-ready`，再运行 `python3 scripts/enable-game-https.py enable 公网IPv4`。切换会撤销旧 NPC 会话，玩家下次聊天自动获得仅通过 HTTPS 发送的新会话。服务器数据库里的游戏存档和反馈保留。浏览器将 HTTP 与 HTTPS 的本地存储分开，已有 HTTP 存档栏位不会自动出现在新地址。

自动续证定时器为 `snap.certbot.renew.timer`。证书更新后，部署钩子会检查并重新加载 Nginx。管理员可用以下命令查看计划并演练续证。

```bash
systemctl list-timers snap.certbot.renew.timer
/snap/bin/certbot renew --cert-name bjtu-life-ip --dry-run --no-random-sleep-on-renew --run-deploy-hooks
```

现有 Ubuntu 站点使用 Nginx 和 Node.js 24。进入解压后的发布包目录，确认包内有 `install-npc-service.sh`、`site/` 和 `service/`。下面是已配置域名和 HTTPS 的站点示例，执行时将示例地址换成玩家实际使用的协议、域名和端口。

```bash
sudo bash ./install-npc-service.sh https://game.example.com
```

脚本更新现有的 `/etc/nginx/sites-available/bjtu-life`，由 Nginx 把 `/api/npc-` 开头的请求转发到本机 `127.0.0.1:8787`。安装后，空浏览器的 `GET /api/npc-account/session` 返回 `401`。首次聊天自动向这个地址发送内容为 `{}` 的 POST，成功时返回 `200` 并设置会话 Cookie，再调用 `/api/npc-chat`。纯静态站点可使用本地台词。

从旧云函数迁移时，在云服务控制台关闭旧 HTTP 触发器的匿名访问，或停用旧入口。推送 Git 分支只更新仓库，云平台上的触发器需要单独更改。旧函数重新部署仓库内的停用处理程序后会返回 `410`。

## 配额与账号管理

服务器检查会话、封禁状态和 NPC 请求字段，再按人物设定组装模型消息。普通聊天、主动邀请、对话摘要和长期记忆反思共用额度。每个账号在滚动一分钟内最多调用 5 次，每个北京时间自然日最多 20 次，全项目每天最多 500 次。服务器在调用模型前通过 SQLite 事务检查并记录次数。

同一来源 IP 每 10 分钟最多创建 30 个新身份，复用有效会话不占创建次数。清除站点 Cookie 或换浏览器会建立新身份。每个身份在 10 分钟内累计 3 次格式错误会暂停 15 分钟。正常耗尽额度只触发限流。账号被暂停、额度用完或模型服务暂时不可用时，游戏使用本地台词。主要响应如下。

| 状态码 | 含义 |
| --- | --- |
| `401` | 会话缺失或过期，浏览器会自动建立会话 |
| `403` | 账号已暂停，或请求来源与游戏站点不符 |
| `429` | 当前额度已用完 |
| `503` | 服务端尚未配置密钥 |

安装脚本使用 `/var/lib/bjtu-npc/accounts.sqlite` 保存账号、会话、额度和违规记录。管理员可在服务器上查看账号列表。

```bash
sudo -u bjtu-npc env NPC_DB=/var/lib/bjtu-npc/accounts.sqlite \
  /opt/bjtu-npc/current/node /opt/bjtu-npc/current/scripts/npc-server.js accounts
```

将命令末尾的 `accounts` 换成 `records ID`、`ban ID` 或 `unban ID`，可分别查看该账号的近期记录、暂停或恢复在线权限，`ID` 取账号列表中的数字。

## 对话与记忆

游戏从存档中取出当前人物的近期问答、累计摘要和相关经历。一轮对话只携带该人物的结构化上下文。服务器从游戏定义中读取人物身份、可邀约的活动和回复格式，前端收到回复后仍按游戏规则校验活动并等待玩家确认。

完成六轮问答后可以更新摘要。学期末或重要经历可触发长期反思，结果保存在当前存档的可选字段 `npcAgentMemory` 中。读取旧档时允许该字段缺省。成绩、关系和毕业条件继续由游戏规则结算。
