# 本机测试环境（Local test environment）

一套**只在这台电脑上**的假系统：本机 Supabase（Docker）+ 假资料 + 假的 Chatwoot 网关。
QA、开发每批上线前都可以真的登录、亲手点，不碰任何正式数据库、不用老板的密码。

- 数据库：slot 0 是 `mirai-local-test`（容器 `supabase_*_mirai-local-test`），端口 **54421**（API）/ **54422**（DB）；其它 slot 见「〇」。下面的命令不加 `--slot` 就是 slot 0。
  不会和 EDUCINEVA 那套撞（它用 54321 附近，现在也是停着的，没动它）。
- 资料全是假的：名字都叫 `Demo …`，电话都是 `601000000xx`，网址是 `example.test`。
- 套的是 repo 里**全部**的 migration（`supabase/migrations`，用链接，不是复制，永远同一份）。

## 〇、多个部门一起用：每个部门自己一个数据库（必读）

**规则：每个部门只用自己编号的数据库（slot），不碰别人的。** 一个 slot = 自己的一组容器 + 自己的端口 + 自己的资料，所以你 reset 不会影响别人。

| slot | 谁用 | 数据库名 | API 端口 | CRM | 学生 App | 假聊天网关 |
|---|---|---|---|---|---|---|
| 0（不加 `--slot`） | ⑥ 质检（上线前清单） | `mirai-local-test` | 54421 | 5180 | 8185 | 3999 |
| 1 | ① Inbox | `mirai-local-test-1` | 54431 | 5181 | 8186 | 4000 |
| 2 | ② 自动化 | `…-2` | 54441 | 5182 | 8187 | 4001 |
| 3 | ③ 招生+学生 | `…-3` | 54451 | 5183 | 8188 | 4002 |
| 4 | ④ 上课 | `…-4` | 54461 | 5184 | 8189 | 4003 |
| 5 | ⑤ 发布 | `…-5` | 54471 | 5185 | 8190 | 4004 |
| 7 | ⑦ UI/UX | `…-7` | 54491 | 5187 | 8192 | 4006 |

用法：所有命令后面加 `--slot 你的编号`，例如 ③：

```bash
node local-test/run.mjs reset mirai --slot 3     # 建自己的库 + 假资料（第一次约 2-3 分钟，会自动启动）
node local-test/run.mjs crm mirai --slot 3        # CRM → http://localhost:5183
node local-test/run.mjs student --slot 3          # 学生 App → http://localhost:8188
node local-test/run.mjs stop --slot 3             # 用完关掉
```
（npm 快捷命令也行：`npm run dev:local -- mirai --slot 3`。也可以设环境变量 `LT_SLOT=3`，那就不用每次写。）

**同一时间最多 2 个 slot 在跑**（Docker Desktop 只有 8GB 记忆体，3 个以上会整台卡死，发生过一次）。程序会挡：要开第 3 个时直接拒绝，并写出哪两个在跑。
- 看谁在跑：`node local-test/run.mjs running`
- 开不了时：先问清楚那两个是谁的，**不在用的那个**请它的主人（或总管）执行 `node local-test/run.mjs stop --slot N` 再开你的。
- 用完马上 `stop --slot 你的编号`，不要留着。Docker 重开后会自动把之前开着的库又起来，所以重开后请先 `running` 看一下。

规矩：
1. **只用自己的 slot。** 不要对别人的 slot 执行 `reset`、`dbtests`、`stop`。slot 0 只给 ⑥ 质检用。
2. `reset` 和 `dbtests` 会先印出「wiping slot N」并等 5 秒，印错编号就按 Ctrl-C。
3. 不要直接去连别人的端口（例如直接对 54421 写资料）；要看别人的资料，请对方开自己的 CRM 页面。
4. 想共用同一批假资料给别人看：告诉对方你的网址（`http://localhost:518N`），不要让对方去重设。
5. 每个 slot 多占约 150MB 磁盘（镜像是共用的，不会重复下载）和一组容器的内存；用完请 `stop`。
6. 假学生都叫 `Demo …`；你自己想加测试资料，请加在**自己的库**里（`local-test/seed/` 新增文件也行），不要改别人的。
7. 要共用的资料文件（`local-test/seed/*.sql`、`test-accounts.json`）改动请通知 ⑥ 和 ⑤（它们会进 git）。

## 一、怎么开、怎么关

先开 Docker Desktop。然后（在项目根目录）：

| 要做什么 | 命令 |
|---|---|
| 第一次 / 想把资料恢复成新的 | `npm run local:reset`（≈ 2 分钟；Mirai 样子）或 `npm run local:reset -- eduhero` |
| 只开数据库（资料还在） | `npm run local:start` |
| 开 CRM（Mirai 样子）→ http://localhost:5180 | `npm run dev:local` |
| 开 CRM（EduHero 样子，自己的名字、没有费用/配套） | `npm run dev:local -- eduhero` |
| 开学生 App（网页）→ http://localhost:8185 | `npm run dev:local:student` |
| 只切学校设定（不清资料） | `npm run local:school -- eduhero`（或 `mirai`） |
| 关掉全部（资料保留，省电脑资源） | `npm run local:stop` |
| 空数据库 + 跑 `supabase/tests/*.sql` 全部数据库测试 | `node local-test/run.mjs dbtests`（≈ 3 分钟；跑完用 `npm run local:reset` 把假资料装回来） |
| 看自己这个 slot 的状态 | `node local-test/run.mjs status --slot N` |
| 看现在哪些 slot 在跑（最多 2 个） | `node local-test/run.mjs running` |

在 Claude 的预览里也可以直接用 `.claude/launch.json` 的 `local-test-crm`、`local-test-student`。
`dev:local` 同时会开一个**假的聊天网关**（端口 3999），所以 Inbox 能读、能开、能标已读/完成、能「发送」（只写进本机资料库）。

用完请 `npm run local:stop`。EDUCINEVA 的容器不要删。

## 二、账号（全部假的，只在本机）

密码都在 `local-test/test-accounts.json`（`LocalTest-2026`，只对 127.0.0.1 有效）。登录页输入用户名即可。

| 用户名 | 是谁 | 能看到什么 |
|---|---|---|
| `admin_test` | admin | 全部 |
| `teacher_test` | 老师（F1 Math、F2 English、HOA Trial Mon） | 自己班的学生/课表；没有 Leads / Inbox |
| `teacher2_test` | 老师（Kids Coding、Holiday Camp），没有额外勾 | 同上；**打不开 Inbox** |
| `staff_test` | 员工：Leads、Inbox、Automations、AI Knowledge **只能看** | 没有 Students / Calendar |
| `staff2_test` | 员工（前台）：Leads、Inbox 可改+删；Calendar、Students、Class Videos 只能看 | 看得到全部学生，不能改 |
| `student_test` / `student2_test` | 学生登录（Demo Aiden / Demo Bella） | 学生 App |
| `parent_test` | 家长登录（Aiden 和 Bella 的家长） | 学生 App（家长身份） |

学生/家长在学生 App 的登录页输入用户名（`student_test` 等）。

另外，本机的 CRM 是 dev 模式，admin 登录后顶端有 **View As (dev only)**，不用密码就能切换成别的账号看菜单（只有本机有，正式站没有）。

## 三、里面有什么假资料

- 学校设定两种：**Mirai**（默认）、**EduHero**（`school-eduhero.sql`：英雄教育CRM 名字、学生编号、第二个 WhatsApp 号码、学生 App 设成游戏大厅）。
- 班级 5 个：F1 Math、F2 English、Kids Coding（**今天的星期几就有课**，今晚 8:30pm）、HOA Trial Mon（试听）、Holiday Camp；课表 + 过去 3 周的点名。
- 学生 12 个（10 正课 + 2 HOA，其中有「配套快过期」「已过期」「已停用」各一）；家长/家庭 11 个；Aiden 和 Bella 是兄妹。
- Leads 17 个（每个阶段都有）、1 个 HOA 预约。积分、套餐记录。
- Inbox：7 个假聊天（WhatsApp 6 + Messenger 1）：有没人回的新 lead、已回的、已完成的、家长聊天、**孩子自己号码的聊天**（右栏会写「This chat is the child」）、未读数；过去 9 天的往来消息（可以在 Team Replies 按「Work out the days」算出数字）。
- 登录：学生、家长各自有登录，学生 App 首页有每日签到/任务。

## 三·五、几件要知道的事

- 有些页面**打开时会自己写资料**（例如 Leads 页对「试听已完成」的 lead 会补建一个 HOA 学生和预约）。这是系统本来的行为；资料乱了就 `npm run local:reset`。
- 每次 reset 同时会套用**全部** `supabase/migrations`（包括还没 commit 的），所以 reset 本身就是「新 migration 能不能从零套成功」的检查。
- `dbtests` 需要**空**数据库；有的测试写死了日期或需要线上才有的密钥（如 chat-activity 的 webhook key），在本机会失败，不一定是程序有错。目前已知：`class_sessions_and_criteria`（写死 2026-10-18）、`inbox_copy_and_team_replies`、`inbox_copy_live`（要 webhook key）、`convert_hoa_student`（要有带登录的老师和学生）、`inbox_stickers`、`student_code_and_month_plans`（需要看一下）。

## 四、测不到什么（诚实清单）

| 项目 | 为什么测不到 | 怎么办 |
|---|---|---|
| WhatsApp 真发送、QR Code、送达/已读勾、手机已读同步 | 没有 Chatwoot / Evolution | Inbox 的读、开、已读、完成、搜索、发送（只写本机）都能测；发布后在正式站看一眼（只看不发） |
| Messenger / Instagram 真实连接（GHL 桥） | 同上 | 本机只有 1 个假 Messenger 聊天 |
| Edge Function（Zoom 课、AI 草稿、AI 报告、Make logins、Bunny 录像、portal-accounts、provision-teacher-auth） | 没开 edge runtime（省资源） | 要测登录建立：用现成假账号；Zoom 课内加入测不到 |
| 自动发送机器人（auto-sender）、pg_cron 定时 | 没有 VPS 上的服务 | 发布部门在正式站验 |
| 真实 Vercel 环境变量 | 本机用 `.env.localtest*` | 发布部门核对 |
| 真实数据量/性能 | 只有十几行 | 正式站巡检补 |

## 五、技术说明（给开发 / 发布部门）

- 文件：`local-test/`（`run.mjs` 命令入口、`mock-gateway.mjs` 假聊天网关、`seed/*.sql` 假资料、`test-accounts.json`、`supabase/config.toml` 本机设定）、`.env.localtest`、`.env.localtest-eduhero`。`package.json` 里加了 `local:*`、`dev:local*` 命令。
- `local-test/.gitignore` 已忽略 `supabase/migrations`（链接）、`.temp`、`.branches`。
- `config.toml` 里 `auto_expose_new_tables = true`：新版 CLI 默认不给新表授权，会让所有表都 403；正式站是旧默认，所以本机打开它才一致。
- 映像版本固定为电脑上已有的（postgres 17.11.0.003、gotrue v2.197.0、postgrest v14.18、storage v1.80.2，写在 `local-test/supabase/.temp/*-version`）。
- 登录用户是脚本 `run.mjs reset` 通过 GoTrue admin API 建的，固定 id，seed SQL 直接引用。
- Vite 用 `--mode localtest`，且 `VITE_SUPABASE_*` 同时从进程环境传入，**不会读到** `.env.local`（那份是正式站）。⚠️ 注意：`launch.json` 里原有的 `mirai-ai-school-crm`、`…-agent-preview`、`…-mock-inbox` 用 `npm run dev`，会读 `.env.local` = **连正式数据库**；要点假资料请用 `local-test-crm`。
- 新增一个 migration 后：`npm run local:reset`（或 `supabase db reset --workdir local-test` 再 `node local-test/run.mjs seed`）；seed 文件若引用到新的必填栏位，会在 reset 时报错，改 seed 即可。
- 加新的假资料：在 `local-test/seed/` 新增 `05_xxx.sql`（编号决定顺序，`\set ON_ERROR_STOP on`，`begin … commit`）。

## 六、上线前必点清单

见 `docs/pre-release-checklist.md`。
