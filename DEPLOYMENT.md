# ELTONEX：Vercel + Supabase 上线步骤

目标项目：`gssdsqqjzqbosrswytak`，API 地址 `https://gssdsqqjzqbosrswytak.supabase.co`。

前端和后台界面部署到 Vercel。询盘数据库、管理员身份验证和 API 部署到这个 Supabase 项目。邮件通知使用 Resend。当前代码已适配，以下云端操作需要在你的账号中完成；项目 URL 本身不是部署凭证。

## 1. 在 Vercel 新建 Project

打开 <https://vercel.com/new>，Import Git Repository，选择 `robber-857/Eltonex`。项目名可用 `eltonex-web`（以可用名称为准）。

| 项目设置 | 值 |
| --- | --- |
| Git branch / Production branch | `dev` |
| Framework Preset | `Other` |
| Root Directory | `./`，仓库根目录 |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |
| Node.js Version | `24.x` |
| Environment Variables | 这一版前端无需填写 |

仓库根目录已经有 `vercel.json`。不要选 Express，也不要把 `server/`、`supabase/` 或本地路径 `personal-site/` 设成 Root Directory。

确认本次部署来自 `dev` 的最新提交。如果导入流程未提供分支选择，创建后在项目的 Git / Production environment 设置中把生产分支设为 `dev`，再从该分支部署。首次部署只是建立网站及固定域名；完成下方 Supabase 设置前，Contact 会提示暂不可用。

复制 Vercel 给出的**固定生产域名**（例如项目 Domains 中的 `https://你的项目.vercel.app`），不要用每次部署变化的 Preview URL。它用于下面的 `PUBLIC_SITE_URL`。新项目无需删除或覆盖原来的 Vercel 项目。

构建只发布 `dist/` 中的页面、图片、字体及后台 UI。API、环境文件、数据库、测试数据和源代码不在发布目录中。`/api/*` 已配置成转发到你指定的 Supabase 项目，无需在浏览器中放服务密钥。

## 2. 在 Supabase 初始化数据库

进入 <https://supabase.com/dashboard/project/gssdsqqjzqbosrswytak/sql/new>。

打开仓库中的 `supabase/migrations/202609210001_enquiry_backend.sql`，复制全部内容到 SQL Editor，执行一次。脚本会建立询盘、管理员名单、会话和限流表，以及相关函数。

这份初始化脚本只运行一次。所有表都开启 RLS，并撤销匿名和普通登录用户的直接读写权限。客户不能通过公开 API 列出询盘，只有后端服务密钥可以操作这些表。

## 3. 创建正式管理员

在 Supabase 的 **Authentication → Users → Add user / Create user** 创建：

- Email：`eltonw482@gmail.com`
- Password：你自己设置的正式后台密码
- 创建时确认该用户的邮箱（Auto Confirm User，如界面提供此选项）

这不是数据库密码，也不是本地演示后台的密码。随后在 SQL Editor 执行 `supabase/setup-admin.sql`。结果应显示你的邮箱和用户 ID；脚本找不到用户会报错，不会静默授权。

后台没有公开注册入口。可在 Authentication 的设置中关闭新用户自行注册。后台每次请求都会验证 Auth 用户、会话和管理员名单；普通 Auth 用户即使登录成功，也不能进入询盘后台。会话最多一小时，过期后重新登录。

## 4. 配置并部署 Edge Function

先进入 **Edge Functions → Secrets**，增加：

| Name | Value |
| --- | --- |
| `PUBLIC_SITE_URL` | 第 1 步的完整 HTTPS 固定生产域名，不带末尾 `/` |
| `NOTIFY_EMAIL` | `eltonw482@gmail.com` |

如果以后要同时允许另一个域名提交，可添加 `ALLOWED_ORIGINS`，多个完整 HTTPS origin 以英文逗号分隔。不要填写 `*.vercel.app`。Supabase 自动提供项目 URL 和后端 API 密钥，不需要放到 Vercel，也不要复制到网页中。

**Dashboard 部署方式（适合当前 Windows 环境）：**

1. 在本地仓库执行 `npm run build:edge`。它会生成 `output/supabase-site-api.ts`。
2. Supabase → Edge Functions → **Deploy a new function → Via Editor**。
3. Function name 填 `site-api`，把生成文件的全部内容粘贴进 `index.ts`，覆盖示例代码，再部署。
4. 在函数设置里关闭 **Verify JWT / Enforce JWT verification / Verify JWT with legacy secret**（具体标签以界面为准）。公共 Contact 和登录端点不需要预先登录；管理员端点仍在函数内部验证身份和权限，不能直接跳过。
5. 修改原始函数文件后，重新执行 `npm run build:edge` 并部署新的生成文件。不要只改生成文件。

**已有可用 Supabase CLI 时也可以：**

```powershell
supabase login
supabase functions deploy site-api --project-ref gssdsqqjzqbosrswytak --no-verify-jwt
```

这条命令只部署函数，不执行 SQL。不要把项目根目录的 Node/Express 服务上传到 Edge Functions；Supabase 使用的是 `supabase/functions/site-api/` 中的实现。

## 5. 启用邮件通知

如果暂时不配置邮件，客户仍可提交，记录保存在后台，通知状态显示 pending。

在 <https://resend.com/domains> 添加你控制的发信域名，并在域名 DNS 中填写 Resend 页面给出的验证记录。验证成功后，创建只用于这个项目的发信 API Key。然后在 Supabase → Edge Functions → Secrets 添加：

| Name | Value |
| --- | --- |
| `RESEND_API_KEY` | 你生成的 Resend API Key |
| `MAIL_FROM` | `ELTONEX <enquiries@你已验证的域名>` |
| `NOTIFY_EMAIL` | `eltonw482@gmail.com` |

Gmail 地址是收件人，不要求它与发信域名相同。`MAIL_FROM` 必须是你的邮件服务允许的发信地址，不能直接假定 Gmail 地址可以当发件人。

新询盘先入库，再尝试发送通知；邮件服务失败不会删除询盘。后台支持手动发送 pending / failed 通知，发送中的记录可在两分钟后重试。这版没有定时自动重试任务；配置好邮件后，之前的 pending 记录需要在后台手动发送。Resend 接受请求后状态为 sent，这不等同于邮箱实际收件证明。通知只发给配置的收件人，客户邮箱用作 Reply-To。

## 6. 验收

1. 打开 Vercel 域名的 `/api/health`，应返回 `{"ok":true}`。
2. 打开 `/admin/`，用第 3 步创建的邮箱和密码登录。
3. 在同一 Vercel 域名的 `/contact.html` 提交一条标注为测试的询盘。
4. 在后台确认详情，修改跟进状态和备注，刷新后应仍保留。
5. 配置邮件后确认 Gmail 实际收到通知，回复地址指向测试客户邮箱。
6. 退出后台，再访问 `/api/admin/enquiries`，应返回 401，不能读取询盘。

只在固定生产域名或明确列入 `ALLOWED_ORIGINS` 的域名上提交。绑定自定义域名后同步修改 `PUBLIC_SITE_URL`，并用最终域名重复以上验收。

本地旧版 SQLite 数据不会自动上传到 Supabase，演示账号也不会自动迁移。请使用新建的 Supabase 管理员。Supabase Free 闲置一周可能暂停，长期生产使用要结合当前套餐的暂停、备份和配额限制决定是否升级。

## 实现与验证边界

- `npm test`：旧本地服务回归、Edge Function 请求逻辑（模拟 Auth/邮件 HTTP）、Postgres SQL 迁移及权限测试（PGlite）。
- `npm run build`：Vercel 静态发布目录；`npm run build:edge`：Dashboard 可粘贴的单文件函数。
- 本地通过不代表已部署到你的 Supabase 项目，不代表 Vercel 反向代理已在线验证，也不代表 Gmail 已实际收到邮件。完成第 6 步才算云端链路验收。

官方参考：[Vercel 构建](https://vercel.com/docs/builds/configure-a-build)、[Vercel 外部转发](https://vercel.com/docs/routing/rewrites)、[Supabase Dashboard 部署函数](https://supabase.com/docs/guides/functions/quickstart-dashboard)、[函数 Secrets](https://supabase.com/docs/guides/functions/secrets)、[Supabase + Resend](https://supabase.com/docs/guides/functions/examples/send-emails)、[Supabase 套餐](https://supabase.com/pricing)。
