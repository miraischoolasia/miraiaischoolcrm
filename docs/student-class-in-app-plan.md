# 学生在我们的网页系统里上课（Zoom Meeting SDK）——交接说明

> 写给接手的 session。日期：2026-10-18。先读完再动手。
> 相关记忆：`project_teacher_zoom_console.md`、`project_classroom_remaining.md`、`project_live_questions.md`。

## 1. 负责人要的是什么

学生打开 **我们的网页版学生系统**（`student-app/`，Expo web，不是手机 App），按"开课"，**Zoom 画面直接在我们的页面里面**（Zoom Meeting SDK），不跳去 Zoom app 或 zoom.us。

在同一个上课画面里：
- 老师在 CRM 的 Live class 控制台做的动作（加分、今日之星、随机点名、分组、计时器、出题、揭晓答案），学生的画面要马上弹出来；
- 之后在同一个页面用摄像头算 **专注度**（只送分数，画面不离开学生电脑；要家长同意）。

## 2. 现在的情况（要改的地方）

| 部分 | 现在 | 要变成 |
|---|---|---|
| 学生按"开课" | `student-app/src/app/(app)/index.tsx` 的 `NextClass.join()` 用 `window.open(zoom_link)` 跳去 Zoom | 打开新页面，例如 `src/app/(app)/class/[sessionId].tsx`，里面嵌 Zoom SDK |
| Zoom 入场资料 | `zoom-lesson` function 的 `prepare` 帮每个学生报名（registrant），把 `join_url`（含 `tk=`）存在 `class_session_zoom_links`；`portal_home` 把它当 `zoom_link` 给 app | 新增一个给学生用的 action（例如 `join_sdk`），回传 SDK 需要的 `signature`（role 0）、`meetingNumber`、`password`、`tk`、`userName`、`customerKey` |
| 老师的特效 | 只用浏览器的 `BroadcastChannel` 送到 **老师同一台电脑** 的投屏窗口（`src/lib/classScreen.ts` 的 `ClassScreenState`，`src/components/ClassScreen.tsx` 画 RollShow / StarStage / TeamsBoard / cheer） | 改用 **Supabase Realtime Broadcast**，送到这一班每个学生的上课页面 |
| 出题卡、+分弹窗 | 学生 app 已有：`src/lib/live.tsx`（`portal_live_state` + 每 12 秒轮询 + 订阅 `live_questions`）、`src/lib/pointsFeed.ts` + `src/ui/PointsBurst.tsx`（`student_points` 实时） | 搬进上课页面，盖在 Zoom 画面上；轮询改慢（见第 6 节） |
| 卡通头像 | CRM 有 `src/lib/avatarLook.ts` + `src/components/StudentAvatar.tsx`（React DOM 的 SVG） | 学生页面也要用（随机点名、今日之星要显示头像）。学生 app 是 React Native，没有装 `react-native-svg`；网页版可以用 `.web.tsx` 直接画 SVG |

## 3. 照着做的参考：EDUCINEVA（已冻结，只参考不改）

路径：`C:\Users\keong\Desktop\EDUCINEVA\educineva`

- `public/zoom/embed.html`：Zoom SDK 放在 **iframe 里的独立小页面**。原因是 Zoom SDK 要 React 18，主程序是 React 19，放同一页会冲突。学生 app 也是 React 19，所以照这个做法。
- `src/features/lesson/zoom-video.web.tsx`：iframe 的外框、量尺寸（ResizeObserver）、用 CSS `scale` 放大、`CROP` 裁掉 Zoom 自带的工具栏。
- `supabase/functions/zoom/index.ts` 的 `case 'join'`（约第 74 行）：给学生 `signature`（`sdkSignature(meetingId, 0)`）、`meetingNumber`、`password`、`tk`、`customerKey`。
- `supabase/functions/_shared/zoom.ts` 的 `sdkSignature()`（约第 96 行）：用 `ZOOM_SDK_CLIENT_ID` / `ZOOM_SDK_CLIENT_SECRET` 签 JWT。
- `docs/PROJECT_BRIEF.md` 第 16、19、23、24 节：真实会议踩过的坑，包括：
  - 学生视图：`speaker`、`ribbon`、`active` 的大小；老师分享屏幕时自动换 ribbon；
  - `updateVideoOptions` 在 SDK 6.5.0 可能不重新排版；
  - Zoom 弹窗（设置、参加者）会掉到画面外，用 `keepPopupsVisible()` 修；
  - 学生默认静音（`mute_upon_entry`）。

## 4. 要新增或修改的东西

### 4.1 Zoom SDK 钥匙（要负责人同意）
- 负责人同意把 EDUCINEVA 的 `ZOOM_SDK_CLIENT_ID`、`ZOOM_SDK_CLIENT_SECRET`（在 `educineva/supabase/.env`）复制到 **Mirai**（`kgagnvrmmrwaflvdvsrd`）和 **EduHero**（`oehgicbvayteuvskjxez`）的 Supabase secrets。之前 S2S 钥匙也是这样复制的：`supabase secrets set --env-file <临时文件>`，用完删掉临时文件，**不要把钥匙贴进对话**。
- SDK 开发版钥匙只能进"同一个 Zoom 账号"的会议。我们的会议都开在负责人的 Zoom 账号（owner eduheroacc3）下面，应该可以先用；正式对外前可能要送 Zoom 审核，到时再确认。

### 4.2 `zoom-lesson` function 加学生入场
- 新 action，例如 `join_sdk { sessionId }`，**给学生 app 的登录用**（child 或 parent）。现在 `zoom-lesson` 只给员工用，这个 action 要另外检查：
  - 用 `portal_may_act_for(student)` 或 `portal_in_session(session)` 确认这个学生在这堂课；
  - 从 `class_session_zoom_links.join_url` 取出 `tk`（或重新报名）；
  - 回传 `{ signature, sdkKey, meetingNumber, password, tk, userName: 学生名字, customerKey: student_id }`。
- `customerKey` 要能让 `zoom-webhook` 认出学生。现在 webhook 用 `registrant_id` 和报名 email 认人，确认 SDK 入场后 `participant_joined` 里仍然有这些。
- 账号强制开等候室：SDK 入场也会先进等候室，老师照旧在 Zoom 里按 Admit。

### 4.3 学生上课页面（`student-app`）
- 新页面 `class/[sessionId]`：Zoom iframe 占大部分，我们的东西盖在上面或放在旁边：出题卡、+分弹窗、点名、今日之星、分组、计时器。
- `public/zoom/embed.html`（Expo web 的 `public/` 资料夹）+ 用 `postMessage` 跟 iframe 沟通。
- 手机宽度也要能用（学生可能用手机浏览器）。
- 离开页面或关分页时，SDK 要正常 `leave`。今天测过关分页的情况：Zoom 约 3 分钟才报离开，原因是 "Unknown Failover"。
- 页面开着时**不要**再每 12 秒轮询；改成实时 + 60 秒保底。

### 4.4 老师特效送到学生（Supabase Realtime Broadcast）
- 频道：每堂课一个，例如 `class:<session_id>`，用 **private channel**，并在 `realtime.messages` 加 RLS：
  - 员工（`can_run_class_session`）可以送；
  - 这堂课的学生和家长（`portal_in_session`）可以收。
- 事件，对应 `ClassScreenState` 里已有的资料：
  - `roll { seq, people[{id, firstName}], chosenId }`
  - `star { seq, id, firstName }`
  - `cheer { id, firstName, points, reason }`
  - `teams [...] | null`
  - `timer { endsAt | pausedLeft }`
- 送的地方：`src/components/LiveClassConsole.tsx` 里现在算 `screenState` 并用 BroadcastChannel 送出去的那段，同时也 `channel.send()` 到 Supabase。只在有变化时送，**不要每 2 秒心跳送**，以免讯息量太大。
- 学生页面收到就播动画。可以把 `ClassScreen.tsx` 的 RollShow、StarStage、Confetti 改写成学生版本。
- 只送名字的第一个字（first name）和头像的 id，跟投屏画面一样。

### 4.5 专注度（第二阶段，可以晚点做）
- 同一个上课页面用 **MediaPipe Face Landmarker**（`@mediapipe/tasks-vision`，开源免费，在浏览器跑）。每 1–3 秒看一次：脸在不在、头转了几度、眼睛有没有张开。低头写字不算不专心。
- 每 20 秒用广播送平均分给老师。下课时每个学生只存一笔小结（平均分、离开镜头几分钟），**不存画面**。
- 家长同意：在 `portal_consents` 加一项（例如 `focus_camera`），没同意的学生不分析。app 上要显示"专注提示开着"。
- 老师端：教室视图（`src/components/console/StudentGrid.tsx` 的 `Seat`）的头像旁边显示绿、黄、红小圆圈；没有资料显示 "—"，不算不专心。
- 注意：Zoom SDK 已经在用摄像头，同一个页面再开一次 `getUserMedia` 通常可以共用。要在真手机（Android Chrome、iOS Safari）上实测。

## 5. 不要动的

- 老师端的 Zoom 流程：老师照旧用 Start as host（`zoom-lesson` 的 `start`）在 Zoom app 里当主持人。只有学生改用 SDK。
- `zoom-webhook` 的进出记录、等候室、断线判断（扣回 60 秒，已经实测）。
- 出席：按 Zoom 时间自动填（Fill from Zoom）。

## 6. 人多时要注意（1,000 人同时在线）

- Supabase Pro 开着 Spend cap 时，Realtime 同时连线上限是 **500**。负责人知道要关掉 Spend cap（上限会变 10,000），也可能升级 Compute。
- 现在学生 app 订阅 `live_questions` **没有按班过滤**，而且每 12 秒轮询一次；+分时会重新载入整个 `portal_home`。上课页面要改：
  - 只收自己这堂课；
  - 轮询改成 60 秒保底；
  - 加分时先在画面上自己加，延后并错开时间再重新载入。
- 老师揭晓答案时，会一次写入很多笔 `student_points`。全部用 postgres_changes 会很慢，**能用 Broadcast 的就用 Broadcast**。
- Mirai 的 Supabase 在悉尼（ap-southeast-2），延迟会比新加坡高一些。

## 7. 测试

- 用测试班和测试学生（做法见 `project_teacher_zoom_console.md` 的 REAL test 段落）：开会议 → 学生在网页里进 Zoom → 等候室 → Admit → 老师加分、点名、今日之星，学生画面要弹出 → 关分页 → 测完把测试资料删掉。
- 学生要用**另一个浏览器**（不能登录 Zoom 主持人账号），也不要开 VPN（今天测试时 Cloudflare WARP 让 Zoom 网页版卡在 "Joining"）。
- Claude 的内置浏览器窗格不能用麦克风和摄像头，专注度要在真的 Chrome 和手机上测。

## 8. 提交代码时

这个 repo 同时有好几个 session 在改。commit 前一刻再看一次 HEAD 有没有变，只放自己的文件（做法见记忆 `feedback_private_index_race.md`），避免盖掉别人的改动。
