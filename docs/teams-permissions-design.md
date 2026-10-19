# 团队、权限、员工班表 —— 设计（第 9、5、7 项）

> 写于 2026-10-19，团队权限部门。**还没写程序**，等总管确认。
> 一句话：加一个「团队」，员工加进团队就自动有那个团队的权限；权限从"按页面"扩充到"按频道"和"按资料范围"；每个人有一周班表和请假，Team replies 只算上班时间的等待；Calendar 拿团队资料来筛选。**上线那天，每个人能看到、能做的东西跟现在一模一样。**

---

## 0. 要总管 / 老板先决定的 5 件事（我的建议放在前面）

| # | 问题 | 我的建议 |
|---|---|---|
| 1 | 一个人可以属于几个团队？ | **可以几个**。例如一位老师下午也帮忙招生 → 同时在「老师」和「销售」。权限取**最宽**的那个（见第 3 节）。 |
| 2 | Inbox 要不要跟 Leads 分开成两个勾？ | **分开**。现在 Inbox 跟着 Leads 的勾走。分开后，上线时每个人的 Inbox 勾 = 他现在的 Leads 勾，所以没有人变。之后才可以做到"行政看 Leads 但不回 WhatsApp"。 |
| 3 | 团队和权限的设定，谁可以改？ | **只有 admin**（跟现在 My Team 一样）。否则有"改权限"权的人可以把自己升级。 |
| 4 | "只看分配给自己的 lead" 的"分配"是什么？ | 现在 lead 的 **PIC 只是一个名字标签**（不是员工帐号）。建议：在 Manage PIC 里把每个 PIC 名字**连到一个员工帐号**。范围选项给三个：**全部 / 自己的 + 还没分配的 / 只有自己的**。 |
| 5 | 还没设班表的人，Team replies 怎么算？ | **照现在一样，全天 24 小时算**。admin 设了班表之后才开始只算上班时间。学校也可以设一个"营业时间"给没有班表的人和"手机发的"用。 |

---

## 1. 新概念：团队

- **团队** = 一组人 + 一套权限。例如「销售」「老师」「行政」。名字、颜色、说明，每间学校自己定（白标）。
- 员工加进团队，就**自动**有那个团队的权限；拿出团队，就**自动**失去（除非别的团队或他个人还有）。
- 现在每个帐号上的勾（个人权限）**继续保留**，当作"个人额外的权限"。上线那天，每个人的权限都来自个人勾，团队是空的 → 没有人变。admin 之后可以慢慢把人搬进团队，再把个人勾清掉。
- 不先放 Mirai 的团队（放了也没人在里面）。设定页有一个按钮「用建议的团队开始」：一按就建好 销售 / 老师 / 行政 三个空团队和建议的勾，admin 再改。
- 团队不删除，只**停用**（白标规矩：用隐藏代替删除）。停用的团队不再给权限。

---

## 2. 资料表

### 新表

| 表 | 放什么 |
|---|---|
| `teams` | `id`、`name`、`color`、`description`、`permissions`（跟现在帐号上的同一个格式，多了 `scope`，见第 6 节）、`is_active`、`sort_order` |
| `team_members` | `team_id` + `teacher_id`（一个人可以有几行 = 几个团队） |
| `inbox_channels` | 每个收件箱一行：`chatwoot_inbox_id`、`kind`（whatsapp / messenger / instagram / other）、`label`、`access`（`open` 全部有 Inbox 勾的人都可以 / `limited` 只有指定的人和团队） |
| `inbox_channel_access` | 谁可以用某个收件箱：`chatwoot_inbox_id` + （`team_id` **或** `teacher_id`）+ `level`（`view` 只能看 / `reply` 可以回） |
| `staff_shifts` | 一周班表：`teacher_id`、`weekday`（0–6）、`start_time`、`end_time`、`effective_from`、`effective_to`（班表改了，旧的那段还留着，旧日子重算时用当时的班表） |
| `staff_roster_changes` | 请假和换班：`teacher_id`、`starts_at`、`ends_at`、`change`（`off` 不上班 / `extra` 额外上班）、`reason`（假的种类）、`swap_id`（换班的两行连在一起）、`note`、`created_by` |

### 改现有的表

| 表 | 改什么 |
|---|---|
| `teachers` | 加 `effective_permissions`（**算好的总权限** = 个人勾 + 所有团队，数据库自动维持，不能直接改）。 |
| `lead_options` | 加 `teacher_id`：PIC 名字连到哪个员工帐号（可以空）。 |
| `team_reply_days` | 加 `duty_waits`（只算上班时间的等待）、`duty_within_target`、`duty_slowest`。原来的 `waits` 照留。 |
| `app_settings` | 加 `leave_reasons`（假的种类，默认：Annual leave / Sick leave / Off day / Swap）和 `business_hours`（学校营业时间，默认空 = 全天）。 |

`whatsapp_numbers` / `whatsapp_number_staff`（① 做的）**不动**。新规则把 `whatsapp_number_staff` 当作"这个人可以回这个号码"。之后 ① 的 Numbers 窗口改用新表时，才合并成一份。

---

## 3. 四种权限怎么叠加

**规则只有一条：权限只会"给"，不会"拿走"。几个来源都给的话，取最宽的。**

来源有三个：① 个人勾；② 每一个所在的团队；③ 角色本身（admin 全部都有；老师永远看得到自己的班）。

- **页面**：某一页，任一个来源给"可以改"→ 可以改；都只给"只能看"→ 只能看；都没给 → 看不到。"可以删除"也一样。
- **资料范围**：**跟着那个动作一起算**，不是分开取最宽。
  例子：阿明在「销售」(Leads 可以改，只限自己的) 和「行政」(Leads 只能看，全部)。
  → 他**看得到全部** lead（行政给的），但**只能改自己的**（只有销售给"改"，而销售限自己的）。
  如果分开取最宽，会变成"全部都能改"，比两个团队给的都多 —— 这是错的，所以不这样做。
- **频道**：先要有 Inbox 页面的勾；然后看那个收件箱：`open` 的跟着 Inbox 勾走（看 = 能看，改 = 能回）；`limited` 的只有指定的人/团队，`reply` 比 `view` 宽。**频道不会超过页面**：Inbox 只能看的人，就算频道给 reply 也回不了。
- **admin**：永远全部，不受任何设定影响。

数据库里怎么做：
- `has_permission(模块, 动作)` **名字和用法不变**，只是改成读 `effective_permissions`。所以现在**所有已经用它的 RLS 规则自动认得团队**，不用一张一张改。
- `effective_permissions` 由触发器自动算：个人勾改了、团队勾改了、有人进出团队、团队停用 → 重算那些人。这样每次查资料不用再去合并团队，速度跟现在一样。
- 新函数 `permission_scope(模块, 动作)`：回答 'all' / 'own_unassigned' / 'own'，给资料范围的 RLS 用。
- 新函数 `can_see_inbox(收件箱)` / `can_reply_inbox(收件箱)` / `can_reply_conversation(聊天编号)`。
- 前端 `can()` 照旧，只是读算好的总权限；多一个 `scopeOf(模块, 动作)`。

---

## 4. 按页面：每一页 看不到 / 只能看 / 可以改

现在只有 7 个勾，其中好几页是"跟着别的勾走"或"只有 admin"。扩充成每一页一个勾：

| 菜单的页 | 勾 | 现在的规则 | 上线时每个人的新勾 = |
|---|---|---|---|
| Today | 不用勾 | 看其他勾显示内容 | — |
| Leads | `leads` | 已有 | 不变 |
| Inbox | **`inbox`（新）** | 跟 Leads | 复制他的 Leads 勾 |
| Automations | **`automations`（新）** | 有 Leads 可以看，admin 才能改 | 有 Leads → 只能看 |
| Forms | `forms` | 已有 | 不变 |
| AI Knowledge | **`ai_knowledge`（新）** | 有 Leads 可以看，admin 才能改 | 有 Leads → 只能看 |
| Calendar | `calendar` | 已有 | 不变 |
| My Classroom | `classrooms` | 已有 | 不变 |
| Class Videos | **`videos`（新）** | 有 Classrooms 就看得到；老师管自己班的 | 复制 Classrooms 的"看" |
| Question Bank | **`questions`（新）** | 只有老师和 admin | 没有（老师照样有自己的） |
| Student List | `students` | 已有 | 不变 |
| App Logins | **`app_logins`（新）** | 跟 Students | 复制 Students 勾 |
| Packages | **`packages`（新）** | 只有 admin | 没有 |
| Class Settings | **`class_settings`（新）** | 只有 admin | 没有 |
| Team Replies | `team_replies` | 已有（只能看） | 不变 |
| Activity Log | `activity` | 已有（只能看） | 不变 |
| My Team + 团队设定 + 班表 | **不开放** | 只有 admin | 只有 admin（第 0 节第 3 点） |
| 员工班表（只看） | **`staff_hours`（新）** | — | 没有（每个人永远看得到自己的） |

做法：那几页现在用 `is_admin()` 或 `has_permission('leads')` 挡的 RLS / RPC，改成用新的勾。admin 照样全部都有；其他人的新勾是照现在的规则复制来的 → 能做的事一样。

> 那几页的表属于别的部门（② 自动化/AI 知识、④ 影片/题库/App 登录、③ 套餐/班级设定）。**我只改"用哪个勾挡"那一行**，写在我自己的 migration 里，不碰他们的程序文件。前端那几页的 `can('leads')` 改成 `can('automations')` 等，在 `App.tsx` 的 `allowedSections` 那一段，一行一行改。

---

## 5. 按频道：哪个号码 / Messenger / Instagram，谁可以看、谁可以回

- 每个收件箱（每个 WhatsApp 号码、Messenger 专页、Instagram）在 `inbox_channels` 一行，`access`：
  - **open**（默认）：有 Inbox 勾的人都看得到；Inbox 可以改的人都可以回。= 现在的样子。
  - **limited**：只有 `inbox_channel_access` 里列出的人或团队；每一行写 `view` 或 `reply`。
- ① 已经加进 `whatsapp_numbers` 的号码：照现在的意思，自动当作 `limited`，`whatsapp_number_staff` 里的人当作 `reply`。（两个数据库现在这两张表都是空的，所以实际上没有东西要搬。）
- **在哪里挡：**
  - **看**：Inbox 副本（`inbox_chats`、`inbox_messages`）的 RLS 改用新规则 → 数据库挡。
  - **回**：消息是经过 VPS 的网关送到 Chatwoot 的。网关现在只问"有没有 Leads 勾"。要改成：送消息的请求，网关再问一次 `can_reply_conversation(聊天编号)`。**这要改 `whatsapp-sender/gateway_auth.py` 和服务器，归 ⑤ 部署。**改之前，"不能回"只是 CRM 画面把输入框藏起来。
  - 网关的 `REQUIRED_MODULE` 也要从 `leads` 改成 `inbox`（⑤ 改服务器的 env）。因为上线时每个人的 Inbox 勾 = Leads 勾，先改后改都不会有人突然进不去。
- **限制（老实讲）**：CRM 有些画面还是直接经过网关读 Chatwoot（不是读副本）。在 Inbox 完全改读副本之前，懂技术的员工绕过 CRM 画面去叫网关，还是可能读到不给他的聊天。我会让网关挡"打开某个聊天的消息"这一种请求，但"列出全部聊天"那一种只能等 ① 完全改读副本。

---

## 6. 按资料范围：只看自己的 lead、自己的班

每个勾多一个"谁的资料"，不是每一页都有：

| 页 | 选项 | "自己的"是什么 |
|---|---|---|
| Leads | 全部 / 自己的 + 还没分配的 / 只有自己的 | lead 的 PIC 连到我的帐号（第 0 节第 4 点） |
| Inbox | 全部 / 自己的 + 还没分配的 / 只有自己的 | 聊天的负责人（`crm_owner_id`，已经是员工编号）是我 |
| Calendar | 全部 / 只有自己的 | 我教的、当助教的、代课那天的课；给我的任务/会议；学校的活动 |
| My Classroom / Student List / Class Videos | 全部 / 只有自己的 | 我教、当助教、代课的班（现成的 `my_classroom_ids()`）和这些班的学生 |
| Team Replies | 全部 / 只有自己的 | 只看到自己那一行 |
| 其他页 | 只有"全部" | — |

- **默认是"全部"**。上线那天每个人的每个勾都是"全部" → 不变。
- 没有勾的老师，照现在一样只看自己的班（这是角色给的，不是勾）。
- 老师现在只要有 Calendar / Classrooms / Students 其中一个"看"，就看得到**全部**班（`can_view_classes()`）。改成：取这三个勾里最宽的范围。默认全部 → 不变。
- 选了"只有自己的"Leads 但 PIC 还没连帐号 → 他会一个都看不到。设定页会用红字提醒："还有 N 个 PIC 名字没连到帐号"。
- 数据库：`leads`、`calendar_items`、班级/课表/学生、`inbox_chats`/`inbox_messages`、`team_reply_days` 的 RLS 加上 `permission_scope(...) = 'all' or 这一行是我的`。函数用 `(select ...)` 包起来，每次查询只算一次（① 之前搜索从 8 秒变 0.06 秒就是靠这个）。

---

## 7. 员工班表和请假（第 5 项）

- **一周班表**：每个人、每个星期几，可以有一段或几段（例如 9:00–13:00、14:00–18:00）。过夜的班拆成两段。
  班表改了，不是覆盖，而是"从某天开始用新班表"，旧日子还记得当时的班表。
- **请假 / 换班**：一张表 `staff_roster_changes`：
  - 请假 = 一段 `off`（可以是整天、几天、或几个小时），选假的种类（学校自己定的清单）。
  - 额外上班 = 一段 `extra`。
  - **换班** = 一次做两行：A 那段 `off` + B 同一段 `extra`，用 `swap_id` 连起来，删一行就两行一起删。
- 谁可以改：admin（第 0 节第 3 点）。每个人看得到自己的班表和请假；有 `staff_hours` 勾的人看得到全部人的（例如排班的行政）。
- 时区：照现在全系统用的 Asia/Kuala_Lumpur；放在 `app_settings` 让以后别的学校可以改。
- 函数 `staff_on_duty_seconds(员工, 从, 到)`：那段时间里他上班了几秒（班表 + 额外 − 请假）。
- **之后可以做（这次不做）**：员工自己申请请假、admin 批准。

---

## 8. Team replies 怎么用班表

现在：家长第一条没人回的消息开始等，到我们下一条消息为止，这段等待算给**回复的那个人**，整段时钟时间都算。

改成**两个数字都留**：
- `waits`（原来的，时钟时间）—— 完全不变。
- `duty_waits`（新）—— 这段等待里，**回复的那个人在上班的秒数**。
  - 晚上 11 点家长传，早上 9:05 他上班后回 → 只算 5 分钟。
  - 他请假那天在手机上回了 → 等待算 0，**不算进他的"慢"**，但"回了几条"照算。
  - 没有班表的人（以及"手机发的"、"自动发的"）→ 用学校营业时间；学校也没设 → 全天算，= 现在的数字。
- 页面（`TeamRepliesSection.tsx`）加一个开关「只算上班时间」：有人设了班表就默认开。中位数、30 分钟内回的比例、最慢，都跟着开关换。
- **旧的每日资料重算**：admin 按现有的「Work out the days」就会用当时的班表重算（`team_reply_compute_day` 加上 duty 的计算）。原来的 `waits` 算法一行都不改，所以重算后原来的数字跟现在一样。
- 网页那一份规则 `supabase/functions/team-replies/logic.ts` 也加同样的计算，并在 `supabase/tests/inbox_copy_and_team_replies.sql` 加对帐测试（SQL 跟网页算出来要一样）。
- **注意**：`team-replies-page` session 现在还在改 Team replies。动这几个文件之前，我会先看它做完没有，避免互相盖掉。

---

## 9. 给 ⑦ 的 Calendar 筛选资料（第 7 项）

⑦ 做画面，我提供资料和函数，写在 `src/lib/teams.ts`：

```ts
type Team = { id: number; name: string; color: string | null; isActive: boolean; sortOrder: number }

useTeams(enabled: boolean): {
  teams: Team[]                       // 只有启用的，按 sortOrder 排
  membersOf(teamId: number): number[] // 团队里的员工编号 (teachers.id)
  teamsOf(teacherId: number): Team[]  // 某人属于哪些团队（可能几个）
  isInTeam(teacherId: number, teamId: number): boolean
  loading: boolean
}

// 一个日历项目是谁的（给"只看我的 / 按团队 / 按人"用）
peopleOfCalendarEntry(entry): number[] // 课 = 主老师 + 助教 + 那天的代课；任务/会议 = 负责人；跟进提醒 = 设的人
```

- 种类（上课、试听、补课、任务、会议、活动、跟进提醒）Calendar 现在已经分得出来，⑦ 直接用。
- "只看我的" = `peopleOfCalendarEntry(entry).includes(我的编号)`。
- "按团队" = 项目的人里有任何一个在那个团队。
- 每个人都读得到团队名字和成员（只是名字，不是权限），所以没有权限设定的老师也可以用这个筛选。
- **额外**：请假（`staff_roster_changes` 的 `off`）也可以给 ⑦ 显示在日历上（例如"Aaron 请假"），要不要由 ⑦ 和老板决定。
- 筛选只是画面，**看得到哪些项目还是由数据库决定**（第 6 节的范围）。

---

## 10. Admin 的设定画面（白话）

全部在 **My Team**（只有 admin 进得去），上面多两个分页：

1. **Accounts**（现在的列表）
   - 每个人旁边显示他在哪些团队（彩色小标签）。
   - Edit 帐号：多一栏「Teams」打勾选团队；权限表格里，团队给的勾显示成灰色并写"from 销售"，个人额外的勾照现在一样可以点；最下面一行白话总结"他现在可以：……"。
2. **Teams**（新）
   - 左边团队清单（拖动排序、停用）；右边是选中的团队：
     - 名字、颜色、说明、成员（选人）。
     - **页面**：每一页一行：看不到 / 只能看 / 可以改，可以删除，谁的资料（全部 / 自己的…）。
     - **频道**：每个 WhatsApp 号码、Messenger、Instagram 一行：看不到 / 只能看 / 可以回。频道本身是 open 还是 limited，在这里也可以切换。
   - 按钮「用建议的团队开始」（只有一个团队都没有的时候出现）。
3. **Working hours**（新）
   - 一个星期的表格：每个人一行，每天格子写几点到几点，点格子改。
   - 请假清单：「+ 请假」（选人、日期/时间、种类）、「+ 换班」（选两个人和那段时间）。
   - 假的种类和学校营业时间在 Class Settings 里改（白标）。

Leads → Manage PIC：每个 PIC 名字旁边多一个"连到帐号"的选择。

---

## 11. 对现有用户的影响

**上线那天：没有人多看到、也没有人少看到任何东西。** 理由：
- 个人勾全部保留；团队是空的。
- 新的页面勾是照现在的规则**复制**过去的（第 4 节表格最右栏）。
- 资料范围全部默认"全部"；没有勾的老师照旧只看自己的班。
- 频道全部 `open`；已加的号码照旧（两边现在都是空的）。
- 没有班表 → Team replies 的数字跟现在一样，旧资料重算后也一样。

**怎么证明**（在本机临时数据库，不碰正式库）：
1. 先把每个测试帐号对每一页、每个动作的 `has_permission` 结果，以及每张表看得到几行，全部记下来。
2. 跑新的 migration。
3. 再记一次，两份**必须完全一样**，有任何不同测试就失败。
4. 再测新功能：团队给权限、多团队取最宽、范围跟着动作算（第 3 节阿明的例子）、limited 频道、请假那段不算等待。

**两个数据库**：Mirai 和 EduHero 用同一套 migration；EduHero 有自己的帐号和设定，团队各自建。

---

## 12. 上线顺序

| 步 | 内容 | 谁 | 会不会有人感觉到 |
|---|---|---|---|
| 1 | migration A `团队 + 算好的总权限 + 新页面勾 + 资料范围的结构`（RLS 只换"读哪一栏"） | 我写，⑤ 推两个库 | 不会 |
| 2 | 前端：My Team 的 Teams 分页、帐号编辑、`allowedSections` 改用新勾、`src/lib/teams.ts` | 我 | 只有 admin 看到新分页 |
| 3 | ⑦ 用 `useTeams` 做 Calendar 筛选 | ⑦ | 多了筛选 |
| 4 | migration B `资料范围的 RLS`（leads、班、日历、inbox、team replies）+ PIC 连帐号 | 我写，⑤ 推 | 不会（默认全部） |
| 5 | migration C `频道` + 网关改问 `can_reply_conversation`、`REQUIRED_MODULE=inbox` | 我写 migration 和 `gateway_auth.py`，⑤ 推库 + 部署 VPS | 不会（默认 open） |
| 6 | migration D `班表 + 请假 + Team replies duty 等待`，然后 admin 按一次「Work out the days」重算 | 我写，⑤ 推 | Team replies 多一个开关 |

每一步都可以单独上，前一步没上，后一步不会坏。Migration 时间戳从 `20261025500000` 开始（现在最新的是 `20261025400000_calendar_layout.sql`，写之前会再看一次）。

---

## 13. 这次不做 / 要别人做的

- 员工自己申请请假、admin 批准 → 以后。
- 网关部署、服务器 env、两个库的 `db push` → ⑤。
- Inbox 完全改读副本（挡住"列出全部聊天"）→ ①。
- ① 的 Numbers 窗口改写新表 `inbox_channel_access`（之后合并成一份）→ ①，不急。
- Calendar 筛选的画面 → ⑦。

---

## 14. 实作结果（2026-10-19，总管确认第 0 节 5 个决定之后）

**一句话：程序全部写好，没有 commit、没有推；本机临时库证明上线那天没有人有任何改变（2156 项检查，0 处不同）。**

### 14.1 跟上面设计不一样的地方
1. **班级类的页面（Calendar / My Classroom / Student List / Class Videos）没有"只有自己的"。** 写的时候发现这是多余的：没有这几页勾的老师本来就只看自己的班，staff 又不能教课。所以"只看自己的班" = 不给这几页的勾。硬做的话要改几十个现有函数，风险大，又没有多出任何功能。"谁的资料"只放在 **Leads（按 PIC）、Inbox（按聊天负责人）、Team Replies（只看自己那一行）**。
2. **Migration 编号**：`20261026000000` ~ `20261026030000`（`20261025500000` 和 `20261025600000` 已经被 ① 用掉）。
3. **Team replies 的"上班时间等待"只在数据库算**；`supabase/functions/team-replies/logic.ts` 没改，因为页面读的是数据库算好的每日资料。
4. **设定画面的位置**：营业时间和假的种类放在 **My Team > Working hours**（不放 Class Settings 窗口，那是 ③ 的文件）。数据库照样要 Class Settings 的"可以改"勾。
5. **帐号编辑窗口（`TeacherModal`，③ 的文件）没改**：它会自动显示新的页面勾和"谁的资料"选择；某人在哪些团队，在 Teams 分页里设定，帐号列表会显示团队标签和总权限。
6. **没有设的 PIC**：PIC 连帐号放在 **My Team > Teams** 最下面（不改 ③ 的 Leads 页面）。

### 14.2 文件
| 种类 | 文件 |
|---|---|
| Migration（**没推**） | `20261026000000_teams_permissions.sql`（团队、总权限、9 个新页面勾、各页改看自己的勾）· `20261026010000_permission_scopes.sql`（Leads / Inbox / Team Replies 的范围、PIC 连帐号）· `20261026020000_inbox_channel_access.sql`（频道权限、网关用的检查）· `20261026030000_staff_hours.sql`（班表、请假、换班、营业时间、Team replies 上班时间等待） |
| 数据库测试 | `supabase/tests/teams_permissions.sql`（76 项）· `supabase/tests/permissions_no_change/`（上线前后对比，2156 项） |
| 网关（⑤ 部署） | `whatsapp-sender/gateway_auth.py` + `test_gateway_auth.py`（15 项） |
| 新前端 | `src/lib/staffTeams.ts`、`src/lib/inboxChannels.ts`、`src/lib/staffHours.ts`、`src/hooks/useStaffTeams.ts`、`src/components/teams/*`（MyTeamTabs、TeamsPanel、ChannelAccessSection、PicLinksSection、WorkingHoursPanel）、`src/dev/TeamsDemo.tsx`（只在本机开发时 `/?demo=teams`） |
| 改的前端 | `src/lib/permissions.ts`、`PermissionMatrix.tsx`、`TeacherManagementSection.tsx`（团队标签）、`TeamRepliesSection.tsx` + `teamReplyDaysApi.ts`（"Only working hours" 开关）、`App.tsx`（每页看自己的勾、My Team 分页、Team replies 开关）、`api.ts`（读总权限，旧库自动退回）、`mappers.ts`、`types/domain.ts`、`types/database.ts`、`main.tsx`（示范页） |

⚠️ `App.tsx`、`api.ts`、`types/*`、`mappers.ts` 里同时有别的部门还没 commit 的改动，⑤ commit 时要按段分开。

### 14.3 验证
- 本机临时库（Docker，Supabase 的 Postgres 映像，跑全部 migration）：
  - **上线前后对比**：14 种帐号 × 16 页 × 3 种动作、34 张表看得到几行、24 种写入、40 个函数 → **0 处不同**；新页面勾全部等于旧勾推出来的值。
  - **新功能 76 项全过**：团队给勾、几个团队取最宽、范围跟着动作算、团队停用就没了、个人勾加团队勾、PIC 只有 admin 能连、自己的 lead / 自己的 + 没分配、不能把 lead 交给别人、按负责人看聊天和消息、限定频道（团队只能看 / 个人可以回）、旧的号码分配照样有效、Team Replies 只看自己、班表、请假、额外上班、换班、改班表不影响旧日子、营业时间、**原来的 Team replies 等待时间一个字都没变**、有班表时只算上班那段。
- `npm run build` 通过；vitest **257 个文件 2,246 项全过**。
- 浏览器（`/?demo=teams`，页面里的假资料，不连数据库）：Teams 分页、频道编辑、Working hours、编辑班表、换班都点过；手机宽度 375 没有左右滑动；没有错误讯息。**真正登录后的 My Team 没有点过**（我不能替人打密码；正式库也还没有 migration）。

### 14.4 交接
- **⑦ Calendar：已接上（总管 2026-10-19 要我接）。** `src/lib/calendarFilter.ts` 的 `fetchCalendarTeams()` 现在调用 `src/lib/staffTeams.ts` 的 `fetchTeamsWithMembers()`，回传每个启用中的团队和成员（`{ id, name, memberIds }`）。数据库还没有团队、或读不到时回传空的，Calendar 照常可以用。每个员工都读得到团队名字和成员。测试：`src/lib/calendarTeams.test.ts`。
- **① Inbox**：
  - `my_whatsapp_inbox_ids()` 名字和用法不变。null = 没限制；有限制时回传**所有看得到的收件箱**（包括 Messenger / Instagram），不再只有 WhatsApp 号码。
  - "可不可以回"：`src/lib/inboxChannels.ts` 的 `fetchMyInboxAccess()` + `canReplyIn(access, conversation.inbox_id, can('inbox','edit'))`，请接到输入框。
  - Inbox 的"只看自己的聊天"在副本（`inbox_chats`）已经挡住；聊天清单如果还是从 Chatwoot 读，请用 `permissionScope(account, 'inbox')` + `inScope()` 过滤（`src/lib/permissions.ts`）。
- **④ App 登录**：`supabase/functions/portal-accounts` 现在检查 `students` 的"可以改"；建议改成 `app_logins` 的"可以改"（上线时两个勾一样，不急）。另外：我不小心用新文件盖掉过 `src/lib/teams.ts`（④ 的课堂分组），**已经照 git 里的版本还原**，跟 HEAD 一模一样，测试通过。如果 ④ 那时候有还没 commit 的改动，请检查一下。
- **⑤ 上线顺序**：
  1. 两个库 `db push`（会连 ① 还没推的 `20261025300000`、`20261025500000`、`20261025600000` 一起推；我的 migration 需要它们在前面）。
  2. 推之前可以先跑 `supabase/tests/permissions_no_change/run.sh`，再证明一次没有人改变。
  3. 推之后，把 `whatsapp-sender/gateway_auth.py` 部署到 VPS，并把两个网关的 `REQUIRED_MODULE` 从 `leads` 改成 `inbox`。
  4. 前端（Vercel）。程序跟数据库谁先谁后都不会让人少看到东西：旧库会自动用旧勾推出新勾。
  5. admin 设了班表之后，在 Team Replies 按一次「Work out the days」，旧日子就用班表重算。

### 14.5 还没挡住的地方（老实讲）
- Leads 的"只看自己的"只挡 `leads` 这张表；跟 lead 有关的其他表（`lead_channels`、`people`、收据、报名步骤）和用 Leads"可以改"的函数（例如合并 lead）还是看全部。
- Inbox 的聊天清单如果从 Chatwoot 读（不是副本），只能靠画面过滤；网关只挡"打开某个聊天"和"在某个聊天里送消息"。
- 网关在部署新版之前，"不能回"只是画面藏起来。
