# 没 commit 的改动分组清单（发布部门，只读整理）

> **快照时间：2026-10-18 23:33（马来西亚时间）**，`main` 在 `cd99e69`（23:12 的 commit），和 `origin/main` 一样，没有未推的 commit。
> 之后别的 session 可能还在改，**真正 commit 前要再跑一次 `git status` 对照本清单**。
> 本次只用了读取命令（git status / diff / hash-object、`supabase migration list`、Read、Grep）。没有 add / commit / stash / push / db push / 部署，也没有改任何源代码。没有跑 `npm run build` 和测试（所以下面「测试」只写“有没有一起改到”，不代表通过）。

## 0. 先看这三点（最重要）

1. **`git status` 显示 64 项，但真正有内容改动的只有 41 项（= 第 1 组 25 + 第 2 组 3 另算的文件 + 第 3 组 8 + 第 4 组 1 + 建议不 commit 的 4 个）。** 其中 **23 个 `M` 文件其实没有任何改动**，只是 Windows 的换行符（LF/CRLF）让 git 以为它们变了。我用 `git hash-object --path` 逐个和 index 对过，23 个内容完全一样，`git diff` 也是空的。**这 23 个不用 commit。**
2. 真正的改动分成 **4 个功能组**，加上「不 commit」和「不确定」两栏。
3. **`db push` 会一起推走别人的 migration：** Mirai 上现在有 **2 个**还没推的 migration（见第 5 节）：`20261024700000_class_live_channel.sql`（第 1 组的，还没 commit）和 `20261020020000_lead_origin_tags.sql`（**已经 commit 在 2ec6806，但从来没推到 Mirai**）。以后跑 `db push` 会两个一起推。推之前请先确认后者要不要一起上。

## 1. 分组总览

| # | 功能 | 文件数 | migration | function 部署 | 建议顺序 |
|---|---|---|---|---|---|
| 1 | 学生在网页学生系统里上课（Zoom SDK + 老师特效） | 25 | 有，未推 | zoom-lesson（两个库） | 最后推（要老板给 Zoom 钥匙） |
| 2 | 迟到提醒带「上课页」链接 `{link}` | 4（其中 `LiveClassConsole.tsx` 跟第 1 组共用） | 无 | 无 | 跟第 1 组一起上线才有用 |
| 3 | 出勤 / 课程 / 试听窗口里点名字打开学生资料 | 8 | 无 | 无 | 可以最先 commit（独立） |
| 4 | 文档：部门分工规矩 | 1 | 无 | 无 | 随时 |

建议 commit 顺序：**3 → 4 → 1 → 2**（第 3 组完全独立、风险最低；第 1、2 组有依赖，放后面）。

---

## 第 1 组：学生在网页学生系统里上课（Zoom Meeting SDK + Realtime Broadcast）

- **对应记忆：** `project_student_class_in_app.md`（2026-10-18 建好，没 push、没部署）；交接文档是 `docs/student-class-in-app-plan.md`；背景 `project_teacher_zoom_console.md`。
- **对应 session：** 「教师Zoom功能需求」交接给现在这个学生 App 上课的 session。
- **建议 commit 信息：** `Students can join the Zoom class inside the student app's page, and the teacher's class-screen moments (roll call, star, cheers, teams, timer) reach each child live`
- **风险：**
  - 要老板同意把 `ZOOM_SDK_CLIENT_ID` / `ZOOM_SDK_CLIENT_SECRET` 放进 Mirai 和 EduHero 两个 Supabase（没有它们，function 会回 `{inPage:false, joinUrl}`，学生 App 退回成打开 Zoom 链接，不会坏）。
  - 记忆里写：还没有用真的学生登录做过一次完整测试（要老板输入密码）。
  - 这个 migration 用 `create or replace function public.portal_home(...)` **整个重写** portal_home（约 150 行）。如果别的 session 之后又改了 portal_home，会互相盖掉。推之前要对照最新版本。
  - migration 还动了 `realtime.messages` 的 RLS policy（Supabase 内部表）。EduHero 要单独验证。
  - 没推 migration 就先上线 CRM：老师控制台打开时订阅 private channel 会静默失败（`classLive.ts` 只在 `SUBSCRIBED` 才发），不会报错。学生 App 没有 `session_id` 也退回旧的「Join class on Zoom」。所以顺序出错也不会炸，只是功能不亮。
- **migration：** `supabase/migrations/20261024700000_class_live_channel.sql`
  - 内容：`portal_home` 的 schedule 每项加 `session_id`、`in_app_zoom`；新函数 `class_channel_session(topic)`；`realtime.messages` 两条 policy（listen / send，topic `class:<session id>`）。
  - **Mirai：没推**（`supabase migration list` 里 remote 是空的）。**EduHero：没查**（要另外的 workdir，这次不碰）。
- **edge function：** `zoom-lesson` 要部署到 **Mirai + EduHero**（改了 `index.ts`、`logic.ts`，新增 `studentJoin.ts`）。要新的 secret：`ZOOM_SDK_CLIENT_ID`、`ZOOM_SDK_CLIENT_SECRET`。
- **推送顺序（记忆里写的）：** migration（两个库）→ zoom-lesson（两个库）→ 前端（CRM Vercel + 学生 App Vercel）。
- **测试有没有一起改到：** 有。`src/lib/zoomLesson.test.ts`（新 describe「joining in the student app page」，约 25 行）。CRM 端的广播和学生 App 的页面**没有单元测试**（记忆里写是用 build / tsc / eslint / expo export 检查的）。

**文件清单（行号是工作区现在的新行号）：**

| 文件 | 状态 | 属于第 1 组的部分 |
|---|---|---|
| `supabase/migrations/20261024700000_class_live_channel.sql` | 新 | 整个文件 |
| `supabase/functions/zoom-lesson/studentJoin.ts` | 新 | 整个文件（95 行） |
| `supabase/functions/zoom-lesson/index.ts` | 改 | 整个文件的改动：13–14（注释）、28（import studentJoin）、68（body 类型）、74–86（`join_sdk` 分支）。全部属于第 1 组 |
| `supabase/functions/zoom-lesson/logic.ts` | 改 | 74–111（`tkFromJoinUrl`、`sdkSignatureClaims`、`signHs256`） |
| `src/lib/zoomLesson.test.ts` | 改 | 133–157（新测试） |
| `src/lib/classLive.ts` | 新 | 整个文件（85 行，`useClassLiveBroadcast`） |
| `src/lib/classScreen.ts` | 改 | 13–14（`cheer` 加 `studentId?`） |
| `src/components/LiveClassConsole.tsx` | 改（**和第 2 组共用**） | **第 1 组的 hunk：** 第 35 行（`import { useClassLiveBroadcast }`）、第 226 行（`setCheer` 加 `studentId`）、416–417（调用 `useClassLiveBroadcast(sessionId, screenState)`） |
| `student-app/public/zoom/embed.html` | 新 | 整个文件（Zoom SDK 6.5.0 放在独立 iframe 页，复制自 EDUCINEVA） |
| `student-app/src/app/class/[sessionId].tsx` | 新 | 整个文件（139 行，上课页） |
| `student-app/src/lib/classRoom.ts` | 新 | 整个文件（`fetchJoinInfo`、`useClassLive`） |
| `student-app/src/lib/avatarLook.ts` | 新 | 整个文件（从 CRM 复制的头像规则） |
| `student-app/src/ui/ClassEffects.tsx` + `ClassEffects.web.tsx` | 新 | 整个文件 |
| `student-app/src/ui/StudentAvatar.tsx` + `StudentAvatar.web.tsx` | 新 | 整个文件 |
| `student-app/src/ui/ZoomRoom.tsx` + `ZoomRoom.web.tsx` | 新 | 整个文件 |
| `student-app/src/ui/ZoomCheckCard.web.tsx` | 新 | 整个文件（网页版摄像头/麦克风检查；手机版 `ZoomCheckCard.tsx` 已在 git 里） |
| `student-app/src/app/_layout.tsx` | 改 | 36（`<Stack.Screen name="class/[sessionId]" />`） |
| `student-app/src/app/(app)/index.tsx` | 改 | 1（import）、143–150（`NextClass` 在网页上进入 `/class/<id>`）、170–172（「Enter class」按钮） |
| `student-app/src/lib/live.tsx` | 改 | 93–151（`LiveProvider` 加 `sessionId`：只听这一课的题，轮询改 60 秒） |
| `student-app/src/lib/portal.ts` | 改 | 21–24（`UpcomingClass` 加 `session_id`、`in_app_zoom`） |
| `student-app/src/ui/LessonSummary.tsx` | 改 | 26–29（`findSessionSummary`） |
| `docs/student-class-in-app-plan.md` | 新 | 整个文件（交接说明，104 行，华文；建议跟这一组一起 commit） |

已核对：新文件用到的 `@/lib/session`、`@/ui/LessonNotes`、`@/ui/PointsBurst` 等都已在 git 里；`student-app/package.json` 没改，新文件没用到 package.json 以外的包；`student-app/public/zoom/embed.html` 里没有 key 或 token（钥匙由 function 给，不写在页面里）。

---

## 第 2 组：迟到提醒带「上课页」链接 `{link}`

- **对应记忆：** `project_student_class_in_app.md` 的「Peer review fixes (same uncommitted batch)」一节；功能本身来自 `project_teacher_zoom_console.md` 的 Late reminder（`20261023120000_live_class_tools.sql`，已推）。
- **建议 commit 信息：** `A late reminder can include {link}, the lesson's class page in the student app, and says "the app" until the school sets the app's address`
- **风险：** 低。没有 `{link}` 时显示「the app」。**但默认文字改了**（`defaultLateReminder.text`）：只影响还没自己改过文字的学校；已经存过自定义文字的学校不受影响。链接指向 `/class/<id>`，所以要等第 1 组上线（学生 App 部署）后才真的有用，不然家长点进去是 404。
- **migration：** 无。**function：** 无。（用的是已有的 `app_settings.student_portal.app_url`，`src/lib/portal.ts:23` 已有。）
- **测试：** 有。`src/lib/liveClassTools.test.ts` 82–92 新 describe「late reminder link」。

| 文件 | 部分 |
|---|---|
| `src/lib/lateReminder.ts` | 11（默认文字）、23–38（`fillLateReminder` 加 `link`，新增 `classPageLink`） |
| `src/components/LateReminderSetting.tsx` | 52、64（说明文字和示例） |
| `src/components/LiveClassConsole.tsx`（**和第 1 组共用**） | **第 2 组的 hunk：** 第 28 行（`classPageLink` import）、第 36 行（`fetchPortalSettings` import）、101–102（`appUrl` state）、194–196（读 `app_url`）、318（`fillLateReminder(... link: classPageLink(appUrl, sessionId))`） |
| `src/lib/liveClassTools.test.ts` | 82–92 |

> **⚠ 同一个文件、同一个 hunk 里混了两组：** `LiveClassConsole.tsx` 第 35–36 行在 git 看来是同一个 hunk（`@@ -33,0 +35,2 @@`），第 35 行是第 1 组（`useClassLiveBroadcast`），第 36 行是第 2 组（`fetchPortalSettings`）。分开 commit 要用 `git add -p` 然后按 `e`（手动编辑 hunk）。**更简单的办法：第 1、2 组合成一个 commit**（它们本来就是同一批、同一个 session 做的，而且链接指向的页面就是第 1 组的页面）。这是我的建议；如果老板想要分开，就用上面的行号拆。

---

## 第 3 组：在出勤、课程、试听窗口里点学生名字打开学生资料

- **对应记忆：** 记忆里**没有**专门的条目。从最近 5 个 commit 看也不属于它们。最像「③ 招生 + 学生」部门的出勤/Calendar 工作。（AttendanceModal 在 `project_teacher_zoom_console.md` 里被提到有「另一个 session 的 hunk」，但那些旧改动已经 commit 了，现在的是新的。）
- **建议 commit 信息：** `A child's name in a class's attendance, a schedule's roster and a trial booking now opens their profile, which sits above the window it was opened from`
- **风险：** 低。纯前端，都是可选 prop（`onOpenStudent?`、`layer?`），没传就跟以前一样。`App.tsx` 是「大家共用、要排队」的文件，现在只有这一组在改它（另有一处无关的 import 顺序，见下面）。
- **migration：** 无。**function：** 无。
- **测试：** 有，而且改得很全：`ScheduleModal.test.tsx`、`TrialBookingModal.test.tsx` 各加了案例；还有一个新文件 `src/App.attendanceProfile.test.tsx`（从出勤窗口点名字打开资料的整合测试）。**这个新测试文件一定要跟这一组一起 commit，不然会漏。**

| 文件 | 部分 |
|---|---|
| `src/App.tsx` | 7200–7204（`StudentDetailModal` 加 `layer`：有别的窗口开着时用 `overlay`）、7396（试听窗口 `onOpenStudent`）、7446（日程窗口 `onOpenStudent`）、7524（出勤窗口 `onOpenStudent`）。**另有 181–183 是无关的 import 顺序对调，见「不确定」栏** |
| `src/components/StudentDetailModal.tsx` | 52–54（`layer` prop 类型）、133（默认值）、293（传给 `ModalShell`） |
| `src/components/modals/AttendanceModal.tsx` | 69–70（prop）、98（解构）、298–301（用 `StudentIdentity`）、650–693（新组件 `StudentIdentity`） |
| `src/components/modals/ScheduleModal.tsx` | 39–40、66、313–338（名字变按钮） |
| `src/components/modals/TrialBookingModal.tsx` | 26–27、61、176–207（有 `studentId` 才变按钮） |
| `src/components/modals/ScheduleModal.test.tsx` | 5（import `Student`）、126–148 |
| `src/components/modals/TrialBookingModal.test.tsx` | 192–207 |
| `src/App.attendanceProfile.test.tsx` | 新，整个文件 |

已核对：`ModalShell.tsx` 在 git 里已经有 `layer` prop（`src/components/ModalShell.tsx:8`），所以 `StudentDetailModal` 传 `layer` 不会缺依赖。

---

## 第 4 组：项目文档（部门分工）

- **对应：** 总管 session 写的 `docs/agent-departments.md`（2026-10-18，华文，110 行）。
- **建议 commit 信息：** `Add the department split and working rules for the CRM sessions (docs/agent-departments.md)`
- **风险：** 无（纯文字）。里面没有 key、没有电话号码。
- **注意：** 文件第 5 节还写着「现在有 62 个文件没 commit」，commit 后就过时了。要不要提交前改一句，由总管决定（我没改）。
- **migration / function / 测试：** 都没有。

---

## 5. Migration 对照（`npx supabase migration list`，Mirai，只看）

| 文件 | git 状态 | Mirai 是否已推 | 说明 |
|---|---|---|---|
| `20261024700000_class_live_channel.sql` | **未 commit**（第 1 组） | **没推** | 本次分组的一部分 |
| `20261020020000_lead_origin_tags.sql` | **已 commit**（2ec6806「A GoHighLevel person's lead gets its source…」） | **没推** | ⚠ 不在这批改动里，但 `db push` 会连它一起推。请老板确认它要不要一起上 |
| 其余本地 migration | 已 commit | 已推 | `20261024610000` 之前的都对得上 |

EduHero 库这次**没查**（要用另一个 workdir 才能列）。推第 1 组 migration 前请发布部门两边都查一次。

## 6. 建议不 commit（4 个文件 + 23 个换行符假改动）

| 项目 | 理由 |
|---|---|
| **23 个“M”但内容没变的文件**：`src/lib/calendarLegend.ts`、`draft.ts`、`draft.test.ts`、`emoji.ts`、`holidays.ts`、`inboxAlerts.ts`、`leadCsv.ts`、`leadCsv.test.ts`、`leadExport.ts`、`leadExport.test.ts`、`leadSearch.test.ts`、`makeup.ts`、`move.test.ts`、`reactionPreview.ts`、`sourceRules.ts`、`specialMessages.ts`、`specialMessages.test.ts`、`specialSend.test.ts`、`studentLink.ts`、`studentLink.test.ts`、`teacherAgenda.test.ts`、`waActions.ts`、`waActions.test.ts` | 内容 hash 和 index 一样，只是 LF/CRLF 造成 stat 变脏（`core.autocrlf=true`）。**`git add` 它们也不会产生任何改动。** 不要 add。 |
| `lms-import-preview.md`（112 行） | 临时预览：EduHero LMS 班级清单表（班级名、学生人数、视频数、主老师）。是 2026-10-17 LMS 迁移的一次性对照表，不是产品的一部分，也不在 `docs/`。 |
| `school-knowledge/mirai-ai-school-knowledge.md`（100 行） | AI 草稿的知识草稿，更新于 2026-10-11。记忆 `project_ai_knowledge_notes.md` 说知识已经改成后台可编辑的 notes（存数据库）。这份文件只是旧草稿；内容含学校业务信息（课程、价钱）。 |
| `school-knowledge/eduhero-notes-draft.md`（105 行） | 「还没有写进 CRM」的草稿，含 EduHero 的价钱、促销，有多处【待确认】。是业务内部资料。 |
| `whitelabel-inventory.md`（78 行） | 2026-10-14 的只读扫描报告（Mirai 写死在代码里的地方）。性质和已在 git 里的 `inbox-audit-2026-10-17.md`、`eduhero-audit-2026-10-17.md` 一样，是报告；**如果老板想留，可以放进 `docs/` 再 commit**。 |

> 这 4 个未跟踪文档里我**没有发现 key、token、密码**（用关键字和长字符串扫过）。只是它们放在项目根目录，不属于产品代码，所以建议不 commit，除非老板要留作文档。

## 7. 不确定归属 / 需要老板或总管决定

1. **`src/App.tsx` 第 181–183 行**：`AppLoginsSection` 和 `ProgrammesSection` 两行 import 对调了位置，**没有任何功能变化**。不属于任何一组。建议：随第 3 组一起带上（因为 App.tsx 那个文件第 3 组本来就要提交），或者用 `git add -p` 跳过这个 hunk 并还原。
2. **`LiveClassConsole.tsx` 要不要拆成两个 commit**（第 1 组 / 第 2 组）：见第 2 组的提醒。我倾向合成一个 commit。
3. **`docs/student-class-in-app-plan.md`**：我放进第 1 组。如果老板觉得交接文档不该进 git，可以移到「不 commit」栏。
4. **`whitelabel-inventory.md`**：放进 `docs/` 还是不 commit，请老板定。
5. **`lead_origin_tags` migration 要不要跟着下一次 `db push` 一起上**（见第 5 节）。

## 8. 给发布部门的操作提醒（只是建议，没有执行）

- commit 前先 `git status` 对照本清单，再用 `git add <具体文件>`（不要 `git add -A`、不要 `git add .`，否则会把第 6 节的东西一起带进去）。
- 混了两组的文件只有一个：`src/components/LiveClassConsole.tsx`。`src/App.tsx` 只有第 3 组的内容 + 一个 import 顺序对调。`zoom-lesson/*` 的改动全部属于第 1 组（没有混别的功能）。
- 私有 index 提交前，再确认一次 HEAD 没有被别的 session 动过（见 `feedback_private_index_race.md`）。
