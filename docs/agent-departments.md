# Mirai CRM — Agent 部门与分工

> 写于 2026-10-18。根据这个项目的 14 个 session 和 67 条项目记录整理。
> **你只跟总管（Claude 主 session）讲话。** 其他部门由总管开、派任务、检查、回报。

---

## 1. 组织图

```
                你（老板）
                   │  只跟总管讲
                   ▼
        ┌──── 总管 (PM / 调度) ────┐
        │  拆任务 · 写任务说明 · 排队 · 验收 · 回报
        ▼        ▼        ▼        ▼        ▼        ▼        ▼
     ① Inbox  ② 自动化   ③ 招生     ④ 上课    ⑤ 发布    ⑥ 质检    ⑦ UI/UX
      聊天     + AI      + 学生     + 学生App  + 服务器   (只读)    设计
```

---

## 2. 七个部门

| 部门 | 负责什么 | 拥有的文件（只有它能改） | 以前做过这块的 session |
|---|---|---|---|
| **① Inbox 聊天** | WhatsApp / Messenger / IG 收件箱、多号码、群组、拆开的聊天、跟进按钮 | `src/components/whatsapp/*`、`src/lib/chatwoot*`、`whatsappInbox*`、`leadChannels*`、`inboxAlerts*`、`waActions*`、`supabase/functions/chat-activity` | WhatsApp Business 多设备消息回复；WhatsApp Web 内容同步 |
| **② 自动化 + AI** | Automations 流程、自动发送、AI 回复草稿、AI 知识库、学习循环 | `src/components/automations/*`、`aiKnowledge/*`、`src/lib/automation*`、`aiDraft*`、`aiKnowledge*`、`aiLearning*`、`functions/ai-draft`、`auto-sender` | Automation 系统理解与实现；AI知识库管理 |
| **③ 招生 + 学生** | Leads、Forms、学生、套餐、Programmes/报名流程、家庭、出勤、Calendar、补课、评分 | `sections/Leads* Forms* StudentDashboard* Programmes* ClassListing*`、`src/components/modals/*`、`src/lib/lead* attendance* makeup* packages*`、`forms/*` | Add Leas；Student 逻辑和系统；学生评分机制；Calendar 功能概览；Marketing menu |
| **④ 上课 + 学生App** | 直播课堂、Zoom、Live 问答、课堂视频/LMS、学生 App、App 登录 | `LiveClassConsole*`、`console/*`、`questions/*`、`videos/*`、`student-app/*`、`functions/zoom-* class-* live-answer-mark voice-question recording-bunny student-report portal-accounts` | 教师Zoom功能需求；Educineva 教学管理系统；学生和家长登录功能；Admin dashboard for teachers |
| **⑤ 发布 + 服务器** | commit / push、`db push`、部署 edge function、VPS（`/opt/mirai-inbox`、`whatsapp-sender/*`）、Vercel、备份、监控 | `supabase/migrations` 的**推送**、`whatsapp-sender/*`、`.github/workflows/*`、git 历史 | （新部门，以前每个 session 都自己推，常常互相盖掉） |
| **⑥ 质检** | 只读：浏览器点一遍、`npm run build`、测试、代码审查、审计报告 | 不改代码，只写 `*-audit-*.md` 报告 | 系统逻辑与优化审查 |
| **⑦ UI/UX 设计** | 定画面规矩（颜色、字、间距、按钮、弹窗、手机版）；新页面先出设计稿给你挑；做完的页面看画面对不对；跨页面的视觉统一 | `design-system/*`、`src/index.css`、共用小组件（`ModalShell`、`StatusChip`、`SummaryBar`、`BrandLogo`、`BrandMascot`、`RowActionsMenu`、`AppNav` 的样式）、`student-app/src/ui/` 里共用的样式 | 帮我去看看学生和老师上课的 ui 画面（EDUCINEVA）；系统 UI/UX 现状分析（EduHero） |

**大家共用、要排队的文件：** `src/App.tsx`、`src/types/*`、`src/components/AppNav.tsx`、`src/lib/api.ts`。
同一时间只给**一个部门**改，由总管排队。

---

**UI/UX 跟功能部门怎么分：** 功能部门负责"能用"（数据、逻辑、自己页面的组件）；⑦ 负责"好看、好用、统一"。
- **新页面或者大改版**：⑦ 先出设计稿（截图或可点的草图），你挑定后，功能部门照着做，做完 ⑦ 再看一次。
- **小改动**：功能部门直接做，照 `design-system/mirai-ai-school/MASTER.md` 的规矩。
- **全站统一**（例如所有弹窗、按钮换样式）：只有 ⑦ 做，做的时候其他部门不碰那些共用组件。

## 3. 一个任务怎么走

1. **你讲需求** → 总管。
2. **总管拆任务**：判断属于哪个部门；跨部门的就拆成几块，并标出谁先谁后。有画面的新东西，⑦ 排在最前面。
3. **派出去**：有旧 session 懂这块的，就发消息给它（保留记忆）；没有就开新的部门 session。
4. **部门做事**：只改自己的文件，写测试，浏览器点一遍，`npm run build`。
5. **质检**（大一点的改动）：⑥ 只读检查一遍。
6. **总管验收**：看 diff 和测试结果，**再回报给你**。
7. **你说 "commit" / "push" / "部署"** → 只交给 ⑤ 执行。

---

## 4. 规矩（每个部门都要遵守）

1. **只有 ⑤ 能 commit、push、db push、部署、碰 VPS。** 其他部门做完就停，交给总管。
   以前的问题：`6d43911` 盖掉了 `c6e7a5c`；`db:push` 把别人还没准备好的 migration 也推上去了。
2. **migration**：部门可以写 migration 文件，但不能推。写之前先看 `supabase/migrations` 里最新的时间戳，避免撞号。
3. **两个数据库**：Mirai 和 EduHero 都要考虑。改了 schema，⑤ 会两边都推，并且两边都验证。
4. **White-label**：所有列表和规则都要能按学校自定义；先放 Mirai 的默认值；用隐藏代替删除。
5. **测试**：在浏览器点一遍，跑 `npm run build`（只跑 tsc 不够）。
6. **回报**：全部用华文写；写清楚做了什么、没做什么、哪些还没验证。
7. **要你批准的事**（push、部署、发 WhatsApp、改服务器）**一律回到总管**，由总管来问你。

---

## 5. 先做的一件事：清理现在没 commit 的改动

2026-10-18 的清单在 `docs/uncommitted-groups-2026-10-18.md`：`git status` 里约 64 项，其中 23 个只是换行符造成的假改动，真正的改动是 4 个功能组。

**做法：** ⑤ 按功能**分批 commit**（每批只放那个功能的文件，并先给你看清单）。之后新开的部门 session 都用**独立 worktree**（各自一个分支），做完再由 ⑤ 合并回 main。

---

## 6. 各部门现在待办（从记录里整理，每个部门最多 5 项）

**① Inbox**
- 第二个 WhatsApp 号码：Evolution `mirai-2` + Chatwoot inbox + gateway 路由（要你提供号码并扫 QR）
- 拆开的聊天：`merge_split_chats.py` 还没设定时任务
- Inbox 审计还剩的项目（只能看的用户也能发送、已读回执等，见 `inbox-audit-2026-10-17.md`）
- Follow-up 提醒按钮：等你回答 3 个决定
- 群组：每条消息是谁发的，还没验证

**② 自动化 + AI**
- HOA flow 6 的修正：migration `20261024000000` 和 VPS sender 部署，等你说 push
- 关键字触发的后续：migration `20261022020000` 还没推
- AI 自动回复（学习循环第 4 步）还没做
- EduHero 的 Gemini key
- 每天检查 flows 的 last_error 和 queue（Automations 归 Claude 负责）

**③ 招生 + 学生**
- Programmes white-label：phase 3–4
- EduHero：要删掉 5 个 Mirai 套餐；自定义费用以后再做
- 出勤权限（目前只有 admin 和班主任能改）

**④ 上课 + 学生App**
- 学生 App 内上课（Zoom SDK）：等你同意拷贝 SDK key、push `20261024700000`、部署
- Phase 2 专注度（MediaPipe）还没开始
- 学生 App 网页版放到 Vercel；EduHero 网页版 + 真实家庭测试
- Bunny key、Zoom S2S app（每个品牌一个）

**⑤ 发布 + 服务器**
- 分批 commit 那 62 个文件（见第 5 节）
- 异地备份到你的 8TB 电脑；VPS 退款截止 **2026-11-10**
- `inbox-uptime.yml` 监控、Instagram 导入、关掉 EduHero 的 QR 刷屏
- Messenger：App Review + 商业验证

---

## 7. 不在这个项目里的 session（总管不管，除非你叫）

EDUCINEVA（2 个）、EduHero Game Changer 系统（6 个）、EduHero AI Marketing、精剪助手、Marketing Tools、Reels Radar，以及各种 scratch 研究 session。
