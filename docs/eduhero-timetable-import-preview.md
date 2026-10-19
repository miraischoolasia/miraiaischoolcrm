# EduHero 课表导入（2026-10-19，可以上线，还没执行）

> 部门：③ 招生+学生。程序码、migration、导入 SQL 都准备好了，**还没有写进正式数据库，也没有 commit**。
> 来源：Google Sheet「2026 FB GROUP ZOOM LINK SHEET」（总表最后更新 29.5.26），EduHero 数据库只读查询（2026-10-19）。
> 本文件**没有**任何 Zoom 密码、Zoom 账号 email 或密码。Zoom 账号只写代号 A1–A10（= Sheet「ZOOM ACC」分页从 B 栏到 K 栏的顺序：A1–A5 是 EduHero 的 5 个账号，A6–A10 = Superstar 1–5）。

## 一句话

**上线后 EduHero 的 Calendar 会有 224 堂每周课（94 个班、26 位老师），从导入那一刻（最早 2026-10-19）到 2026-12-31；每一堂都有自己的 FB 群和固定 Zoom 链接。**

| 项目 | 数字 |
|---|---|
| 每周课堂 | 224 堂（一 45、二 45、三 32、四 43、五 44、六 15），全部对上 |
| 用到的班 | 94 个（现有 92 个 + 新开 2 个） |
| 老师 | 26 位（全部是 CRM 现有的老师账号） |
| FB 群组 | 224/224，**每堂一个不同的群** |
| 固定 Zoom 链接 | 224/224（212 个在 us06web，12 个在 us02web） |
| 配了 Zoom 账号的老师 | 22 位（A1–A7、A9；没有人用 Superstar 3、5） |
| EduHero 现在 | 0 堂课；Zoom 账号池 0 个、每个账号最多 1 堂、0 位老师配账号 |

## 0. 老板 2026-10-19 的决定，怎么做的

| # | 决定 | 做法 |
|---|---|---|
| 1 | 升级班 | Y6 升 F1 的 4 堂放进原本的 Year 6 班（MM Year 6 3 堂、SEJ Year 6 1 堂）；F3 升 F4 AM 的 2 堂放进**新开的「AM 升级班 Form 3」**（班别「升级班」也是新加的，排在「双语班」和「备战班」中间） |
| 1 | F3 SC 双语 Mr Kee | **新开「SCI (双语) Form 3」**。理由：Form 1、2、4、5 都已经有「SCI (双语)」班，双语学生是另一组人；放进「SCI Form 3」会让点名名单混进 79 个不是双语的学生，而且 SCI Form 3 已经有两组同时上课 |
| 2 | Ms Eunice | Sheet 用她的姓称呼她，CRM、报告、课名一律写 **Ms Eunice**：三 7.00pm F5 ACC、四 7.00pm F4 ACC |
| 3 | 每堂课的链接 | 正式 migration `20261025200000_schedule_links.sql`：`schedules.fb_group_url`、`schedules.zoom_link`（两个库都上，Mirai 空着） |
| 4 | Zoom 第 1 步 | 每堂存固定链接（私密档，不进 repo）；22 位老师配账号，避开 Superstar 3、5；账号池 8 个，每个 2 堂 |
| 5 | 日期 | 老板改成「今天开始」：2026-10-19 到 2026-12-31。导入时已经开始的课从下一次才算（见第 1 节） |

**新开的 2 个班一开始没有学生**：要在班级页把学生加进去，点名才会有名单。

## 1. 要注意的地方

- **今天已经上过的课不会变成欠点名。** CRM 的「earlier classes without attendance」和老师的「Attendance missing」是这样算的：今天以前、没有点名的课。今天的课只会在 Today 显示成「还没点名」，**明天才会变成欠点名**。所以导入 SQL 用「导入那一刻（马来西亚时间）」决定每堂课从哪天开始：
  - 今天这个时间之前已经开始的课 → 从明天开始生效，第一堂是下星期。今天这几堂不会出现在 Calendar、Today，也不会变成欠点名。
  - 其他课 → 从今天开始。
  - 本机测试在今天下午 1:04 跑：星期一 8.15am、9.40am 的 **6 堂**从下星期一开始，其余 **218 堂**从今天开始。
  - 如果发布部门明天才跑，今天和明天跑之前的课都不会算，不用改任何东西。
  - 这样做不用加「取消这天」的记录（那会让 Calendar 出现划掉的课，也可能被当成要补课），也不用改别的部门的程序。
- **今天下午 3.45pm 以后的 39 堂星期一课**：导入后会出现在 Today。如果老师今天没有在 CRM 点名，**明天会变成欠点名**。如果老师今天还不会用 CRM 点名，有两个做法：① 今天由行政帮忙点名；② 发布部门在今天上完课以后（9.45pm 以后）才跑导入，这样今天的课全部从下星期开始。
- **⚠ 每个月 29、30、31 号不会有课**：CRM 有一条 Mirai 的规则「每个月只上 4 堂」，写死在日历和数据库里（`schedule_meets_on` 等函数、`schedule.ts` 的 exrule）：普通班在 29–31 号**不显示、不能点名**。EduHero 的重播有「MAY WEEK 5」，看起来 EduHero 第 5 个星期也上课。这段时间会被跳过的日子：10/29（四）、10/30（五）、10/31（六）、11/29（六）、11/30（一）、12/29（二）、12/30（三）、12/31（四）。要改成每间学校可以自己设定（white-label），这是另一个工作，要老板决定。

- **同一个班同一时间有两堂课**（9 次）：8 次是 SCI 和 SAINS（例如星期一 8.15am F1 SCI Ms Angeline + F1 SAINS Ms Joey，都在「SCI Form 1」），1 次是星期五 7pm「SEJ Year 6」（Y6 SEJ Ms Jessie + Y6 升 F1 SEJ Mr Jack）。两位老师点名会看到同一份班级名单，各自勾自己来上课的学生。以后如果要分开，要先知道哪些学生上 SAINS。
- **年级分页还有 21 堂总表里没有的课**（13 堂 F3 升 F4 试听班、2 堂 Y6 升 F1、2 堂 Y3 升 Y4、Y1/Y2 BC Ms Kiwi），这一轮没有导入。
- **YEAR 6 分页写了 11 月起换老师**（例如 Y6 BMP 11 月起 Ms Jessie 教）。那时用「班级 → 换老师」或在课表改，CRM 会从那天起分开新旧老师。

## 2. 名字写法不一样的（已自动对上）

| Sheet 写法 | CRM | 堂数 | 例子 |
|---|---|---|---|
| SAINS、SC | SCI | 10 + 3 | F1 SAINS MS JOEY、Y4 SC MS JOEY |
| CHEMI | CHE | 8 | F5 CHEMI MS TINA |
| PHYSICS | PHY | 4 | F4 PHYSICS MR KC |
| BIOLOGY | BIO | 4 | F5 BIOLOGY MR KC |
| PN | PER（Perniagaan） | 2 | F4 PN MS AUDREY |
| AKAUN | ACC | 1 | F5 AKAUN MR KEE |
| 双语（SCI/SAINS） | 「SCI (双语) Form N」班 | 6 | F2 SCI MS JOEY 双语 |
| 双语（MM/AM） | 普通「MM / AM Form N」班（CRM 没有 MM 双语班） | 12 | F2 MM 双语 MR HENRY |
| MS MAD | Ms Madeline | 6 | F1 GEO MS MAD |
| MS LI JIA | Ms LiJia | 1 | Y5 MM MS LI JIA |
| MS KC（写错） | Mr Kc | 1 | F4 BIOLOGY MS KC |
| 用姓氏称呼的 ACC 老师 | Ms Eunice | 2 | F5 ACC MS EUNICE |

## 3. 老师对照表

| Sheet 名字 | CRM 老师（id） | 堂数 | Zoom 账号 | 备注 |
|---|---|---|---|---|
| MS ANGELINE | Ms Angeline (26) | 12 | A1 | 用一个个人会议室上 7 班 |
| MS SOPHIA | Ms Sophia (29) | 9 | A1 | |
| MR HANSON | Mr Hanson (33) | 3 | A1 | |
| MR IVAN | Mr Ivan (48) | 1 | A1 | |
| MS KIWI | Ms Kiwi (35) | 9 | A2 | |
| MS REGINA | Ms Regina (24) | 7 | A2 | |
| MS JENNY | Ms Jenny (55) | 5 | A2 | 不是「Jenny Admin」(31, staff) |
| MR JACK | Mr Jack (38) | 6 | A3 | A3 也写「Management Team」 |
| MS MADELINE / MS MAD | Ms Madeline (27) | 13 | **A3**（Sheet 原本 A8） | A8 = Superstar 3 是 Mirai Milo 老师的 |
| MS TINA | Ms Tina (23) | 12 | **A3**（Sheet 原本 A10） | A10 = Superstar 5 是 Mirai Ho Jia Hui 老师的 |
| MS ANGIE | Ms Angie (9) | 11 | A4 | |
| MR DANNY | Mr Danny (28) | 2 | A4 | |
| MS LIJIA | Ms LiJia (50) | 1 | A4 | CRM 还有一个「lerjiajia」(36, teacher)，可能重复 → 请确认 |
| MS ABBY | Ms Abby (42) | 16 | A5 | 不是「Abbey」(11, staff) |
| MS RACHEL | Ms Rachel (10) | 12 | A5 | |
| MS QING | Ms Qing (12) | 3 | A5 | |
| MS JOEY | Ms Joey (52) | 15 | A6 | CRM 还有「Joey」(53, staff，登录名像旧网站学生号) → 请确认要不要停用 |
| MS MELISSA | Ms Melissa (21) | 10 | A6 | |
| MS HAPPY | Ms Happy (51) | 11 | A7 | |
| MR HENRY | Mr Henry (14) | 16 | A7 | |
| MS AUDREY | Ms Audrey (30) | 10 | A9 | |
| MS JESSIE | Ms Jessie (13) | 12 | A9 | |
| MASTER TAN | Master Tan (41) | 11 | **不在 ZOOM ACC** | 链接在 us06web，账号不明 → 先用固定链接 |
| MR KEE | Mr Kee (25) | 5 | **不在 ZOOM ACC** | 链接在 us06web，账号不明 → 先用固定链接 |
| MR KC | Mr Kc (15) | 10 | **另一个 Zoom 账号**（us02web） | 先用固定链接 |
| MS EUNICE | Ms Eunice (17) | 2 | **另一个 Zoom 账号**（us02web） | 先用固定链接 |

CRM 里有、但总表没有课的老师：Teacher Ali (8)、lerjiajia (36)、Mr Lex (46)。
My Team 实际是 **29 位 teacher、21 位 staff、2 位 admin**。

## 4. 画面改了什么

| 地方 | 改了什么 |
|---|---|
| Calendar → 点一堂课（课表弹窗） | 多了「FB group link」「Fixed Zoom link」两栏，可以看、可以改，旁边有「Open」直接打开。贴「www.…」会自动补 https:// |
| 课表弹窗存档 | 一个班可以有几位老师的课：**存档时保留这堂课自己的老师和课名**（以前会被改成班级主老师和班名） |
| 改班名 | 只改跟旧班名一样的课名；像「F1 SAINS MS JOEY」这种自己的课名不会被盖掉 |
| 换班级主老师 | 只搬原本主老师的课，**其他老师的课不动**；搬过去的新课保留 FB 群和 Zoom 链接 |
| 老师 Live class → Zoom 卡片 | 还没让 CRM 开会议时，显示「Open fixed link」：先用这堂课的固定链接，没有就用班级的 |
| 学生 App | 上课的 Zoom 备用链接：先用这堂课的固定链接，再用班级的 |

## 5. Zoom 方案

1. CRM 用的 Zoom S2S app 建在 **A1 那个 Zoom 主账号**下，这个主账号的 10 个用户 = A1–A10，所以 CRM 可以替 A1–A10 开会议（us06web 只是服务器区域）。2026-10-18 已经在 Superstar 5 真实测试成功。
2. **Superstar 3（A8）、Superstar 5（A10）给 Mirai 用**（Milo、Ho Jia Hui）。两个 CRM 看不到对方开着的会议，所以 EduHero 的老师对照和账号池都不用这两个。
3. Ms Madeline（13 堂）、Ms Tina（12 堂）改到 **A3**：逐个账号试过，只有 A3 放得下。改完 **每个账号每个时段最多 2 堂，没有撞**（A3 一周 31 堂，有 10 个时段刚好 2 堂；这 10 个时段管理层不能再用 A3 开会）。build_import.py 每次都会检查，超过 2 堂就停下来。
4. **Mr KC、Ms Eunice 的会议在 us02web，是另外的 Zoom 账号；Master Tan、Mr Kee 不在 ZOOM ACC。** 他们先用固定链接。**要搬进 A1–A10 其中一个账号（不能是 Superstar 3、5），CRM 才可以替他们自动开会议**；搬之前先用 build_import.py 检查会不会撞。
5. 第 2 步（学生 App 登录普及后）才改成 CRM 每堂自动开会议 + 个人链接 + 自动点名。大班（例如 SEJ Form 5 有 441 个学生）要先测报名速度。

## 6. 其他分页

| 分页 | 里面是什么 | 在 CRM 可以做什么 | 建议 |
|---|---|---|---|
| ZOOM ACC | 10 个 Zoom 账号的 email、**密码**、每个账号给哪些老师、每周排课格子 | 老师 → Zoom 账号对照（第 5 节） | **用**（只用老师对照；密码不进 CRM） |
| FORM 1–5、YEAR 1–6 | 每个年级各科所有时段的 FB 群，加一段「麻烦申请加入上课群」的话给顾问发 | 报名后在 Inbox 一键发「这个科目要加的群」，可以从课表的 FB 链接自动生成 | **以后做**（不用另外存这些页） |
| SHORTCOURSE | 短期课/备战班 FB 群 | CRM 已有备战班，但没有学生、没有时间 | 等有开班日期再导入 |
| 重播BUNNY | 重播 SOP、**Bunny API 钥匙**、老师 Bunny 登录（**含密码**）、Bunny 库链接 | 已经在 CRM：175 个库、185 个对照、4164 部录像 | **不用再导入** |
| 2027 各年级、2027 SHORTCOURSE | 明年课表：214 堂有时间 + Y3 6 堂未定时间 + 16 个短期课群；130 堂标 DONE | 明年 1 月用同一个 script 导入 | **做**，等 2027 定案 |
| 中学/小学重播群 | 每月或每季一个 FB 重播群（158 + 62 + 74 个群） | 录像已经在 CRM + 学生 App | **不做** |
| Checklist、重播群Checklist | 每月检查老师有没有上传每周重播 | CRM 可以从录像自动算 | **建议做成报表** |

## 7. 安全提醒

Sheet 里有 10 个 Zoom 账号的**密码**、**Bunny API 钥匙**、老师的 **Bunny 密码**，Zoom 格子里也有会议密码。建议：① Sheet 只给管理层；② 密码搬去密码管理器；③ **换一个新的 Bunny API 钥匙**（CRM 的 Bunny 设定一起更新）。

## 8. 上线步骤（照顺序，一步做完再做下一步）

| # | 步骤 | 小白讲解 | 风险 |
|---|---|---|---|
| 1 | **Migration 上两个数据库**（Mirai、EduHero）：`20261025200000_schedule_links.sql` → `20261025210000_portal_lesson_zoom_link.sql` → `20261025220000_reassign_keeps_co_teacher_lessons.sql` | 在课表表格多加两个空栏位放链接；学生 App 的 Zoom 备用顺序改一行；换主老师时不再动别的老师的课。**第 2 个要等「教室部门」的 `20261024700000_class_live_channel.sql` 先上**，因为它是在那个版本上改一行 | **中**：改到正式表格和两个函数；只加栏位，不删资料。Mirai 不受影响（栏位空着） |
| 2 | **前端上线**（发布部门 commit + push，Vercel 自动部署） | 课表弹窗出现两个链接栏、Live class 出现固定链接按钮。**一定要在第 1 步之后**：前端会读新栏位，数据库没有就读不到课表 | **中**：两间学校的 CRM 都会换新版；顺序错了 Calendar 会读不到课表 |
| 3 | **导入 EduHero**：`docs/eduhero-timetable-import/import_schedules.sql`（只在 EduHero） | 开 2 个新班、加 224 堂每周课和 FB 链接、把老师加进各班老师名单。导入那一刻之前已经开始的课从下一次才算，不会变成欠点名。不是 EduHero 数据库会自己停；跑两次不会重复。最后一行会显示「start_after_first_day」= 从第二天以后才开始的课有几堂 | **中**：一次写进 224 堂课；有 `rollback.sql` 可以退回 |
| 4 | **私密 Zoom 档**：`zoom_private.sql`（不在 repo，在 ③ 部门暂存区，见共享笔记） | 把 224 个固定 Zoom 链接填进每堂课、22 位老师配 Zoom 账号、设账号池 | **中**：内容有会议密码和账号 email，执行完把档案删掉，不要贴到任何地方 |
| 5 | **账号池检查**：Class Settings → Zoom | 看到 8 个账号（A1–A7、A9）、每个最多 2 堂；没有 Superstar 3、5 | **低**：只看，有错直接在画面改 |
| 6 | **打开 EduHero Calendar 检查** | 下星期（10/26 那一周）应该有 224 堂（10/29、10/30、10/31 的课会因为 29–31 号规则不显示）；点一堂课看 FB/Zoom 两栏有值；开一堂 Live class 看「Open fixed link」；把学生加进 2 个新班 | **低**：只看 |

退回：`rollback.sql` 删掉导入的课和新开的空班；已经有点名或上课记录的课会留下并列出来。Migration 不退回（空栏位留着没有坏处）。

## 9. 文件和测试

| 文件 | 作用 |
|---|---|
| `supabase/migrations/20261025200000_schedule_links.sql` | 两个链接栏位 + 必须是网址的检查 |
| `supabase/migrations/20261025210000_portal_lesson_zoom_link.sql` | 学生 App：这堂课的固定链接排在班级的前面 |
| `supabase/migrations/20261025220000_reassign_keeps_co_teacher_lessons.sql` | 换主老师只搬他的课，链接跟着走 |
| `supabase/tests/schedule_links.sql` | 8 项 SQL 检查 |
| `src/lib/scheduleLinks.ts` + `.test.ts`、`src/components/LessonLinkFields.tsx` | 链接检查、备用顺序、保留老师的规则、弹窗两个栏位 |
| 改动的现有文件 | `App.tsx`、`ScheduleModal.tsx`、`LessonZoomCard.tsx`、`types/database.ts`、`types/domain.ts`、`lib/api.ts`、`lib/mappers.ts`、`lib/schedule.ts`（`App.tsx`、`ScheduleModal.tsx`、`database.ts` 里也有别的部门没 commit 的改动，发布时只 commit 本部门的部分） |
| [import_schedules.sql](eduhero-timetable-import/import_schedules.sql)、[rollback.sql](eduhero-timetable-import/rollback.sql) | 导入 / 退回 |
| [preview.csv](eduhero-timetable-import/preview.csv) | 224 堂逐行对照（只写有没有链接） |
| [build_import.py](eduhero-timetable-import/build_import.py)、[db_snapshot.sql](eduhero-timetable-import/db_snapshot.sql) | 从 Sheet 重新生成（会检查 Zoom 账号不超过 2 堂） |
| `zoom_private.sql` | **不在 repo** |

**测试结果**（都在本机 Docker 的临时数据库，测完删掉，**没有碰正式数据库**）：
- 导入（2026-10-19 下午 1:04 跑）：224 堂、94 个班、26 位老师、2 个新班；6 堂（星期一 8.15am、9.40am）从 10/20 开始生效，218 堂从 10/19；再跑一次还是 224 堂；私密档 224 个链接、22 位老师、账号池 8 个 × 2 堂；退回后只留下有点名记录的那 1 堂，新班删掉。
- SQL 检查 8/8 PASS（两个栏位、网址检查、App 备用顺序、换主老师只搬自己的课且链接跟着走）。
- 前端：全部测试 2125 个通过；`npm run build` 通过。

**已知限制**：在 Calendar 拖动某一天的课（只改那一天）会变成单日补课，那一天没有带固定链接，要在弹窗补上。
