# NPC 在线对话接入说明

周宁、陈老师和林夏共用本站 `/api/npc-chat`。玩家可以从设置里的「NPC 在线账号」或人物对话里的「在线账号」注册，保存游戏登录码供下次登录。游客可以照常读档、游玩和使用本地台词。

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

看到 `active` 后，用游戏登录码登录，给已认识的人物发一条消息。在浏览器开发者工具的「网络」面板中，确认这次 `POST /api/npc-chat` 返回 `200`，响应包含 `reply`。这样可以确认真实模型调用已接通。密钥只保存在服务器上，前端、部署包和 Git 提交均无需更新。[DeepSeek 密钥管理](https://platform.deepseek.com/api_keys)

## 站点部署与旧入口迁移

现有 Ubuntu 站点使用 Nginx 和 Node.js 24。进入解压后的发布包目录，确认包内有 `install-npc-service.sh`、`site/` 和 `service/`。下面是已配置域名和 HTTPS 的站点示例，执行时将示例地址换成玩家实际使用的协议、域名和端口。

```bash
sudo bash ./install-npc-service.sh https://game.example.com
```

脚本更新现有的 `/etc/nginx/sites-available/bjtu-life`，由 Nginx 把 `/api/npc-` 开头的请求转发到本机 `127.0.0.1:8787`。安装后用游客身份访问 `/api/npc-account/session` 应返回 `401`。纯静态站点可提供本地对话，在线功能需要同站账号与对话服务。

从旧云函数迁移时，在云服务控制台关闭旧 HTTP 触发器的匿名访问，或停用旧入口。推送 Git 分支只更新仓库，云平台上的触发器需要单独更改。旧函数重新部署仓库内的停用处理程序后会返回 `410`。

## 配额与账号管理

服务器检查会话、封禁状态和 NPC 请求字段，再按人物设定组装模型消息。普通聊天、主动邀请、对话摘要和长期记忆反思共用额度。每个账号在滚动一分钟内最多调用 5 次，每个北京时间自然日最多 20 次，全项目每天最多 500 次。服务器在调用模型前通过 SQLite 事务检查并记录次数。

已登录账号在 10 分钟内累计 3 次格式错误会暂停 15 分钟。正常耗尽额度只触发限流。账号被暂停、额度用完或模型服务暂时不可用时，游戏使用本地台词。主要响应如下。

| 状态码 | 含义 |
| --- | --- |
| `401` | 请登录，或会话已过期 |
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
