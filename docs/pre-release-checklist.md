# 上线前必点清单（本机测试环境）

每一批打包上线**之前**，质检在本机测试环境（`docs/local-test-env.md`）照这张单点一遍，每项截图（放 `docs/site-check-…/`，文件名以「本机-」开头），结果写进该批的检查报告。
正式站上线**之后**的巡检（只看、不改）是另一张单子，这张是上线前的「亲手点」。

开始前：`npm run local:reset`（资料恢复成新的）→ `npm run dev:local`（CRM，5180）→ `npm run dev:local:student`（学生 App，8185）。
密码在 `local-test/test-accounts.json`。每项分「预期」和「测不到」。✅ 过 / ❌ 不过 / ➖ 本机测不到。

## A. 登录与菜单（每个身份各一次）
1. `admin_test` 登录 → 菜单：Marketing（Leads、Inbox、Automations、Forms、AI Knowledge）、Teaching、Students、Admin 都在。
2. `teacher_test`、`teacher2_test` → 只有 Today、Calendar、My Classroom、Class Videos、Question Bank；**没有** Inbox / Leads。
3. `staff_test` → Today、Leads、Inbox、Automations、AI Knowledge；没有 Students、Calendar。
4. `staff2_test` → 多了 Calendar、Students、Class Videos（只能看）；Leads、Inbox 可改。
5. 打错密码 → 有提示，不进去。登出 → 回登录页。

## B. Inbox（假聊天；WhatsApp 真发送测不到 ➖）
1. admin 打开 Inbox：WhatsApp 6 个聊天 + Messenger 1 个；Unread 角标 = 未读数。
2. 搜索框：搜「Aiden」「Parent One」、搜号码「60100000031」「+60-10-000-0031」都找得到；清掉后列表恢复。
3. 打开 Demo Parent Aiden：消息显示，右栏有 Family（家长 + 孩子）、标签 Regular。
4. 打开 `+60 10-000 0042`：右栏最上面写 **This chat is the child**（Demo Caleb），下面是家长的 lead。
5. 「Sending from」：有 1 个号码时是普通标签；`npm run local:school -- eduhero` 后有 2 个号码，应变成可切换。
6. 写一句话按发送 → 出现在聊天里（只写本机，➖ 真的 WhatsApp 发送）；Done / 标未读可用。
7. `staff_test`（只能看）：能看聊天，**发送框不能用**或发不出；`teacher_test`：没有 Inbox。
8. Numbers 窗口：能打开（➖ QR / 加号码要真服务器）；窗口比屏幕高时能滚动。

## C. Leads
1. 看板每个阶段都有卡片（new / contacted / trial scheduled / trial completed / converted / lost）。
2. 打开一个 lead：资料、孩子、备注可看；`staff2_test` 可改，`staff_test` 只能看。
3. Follow-up 窗口：有 Open chat 按钮（该 lead 有聊天时）。

## D. Students 与 My Classroom
1. Student List：12 个学生；有「快过期」「已过期」「已停用」的标记。
2. 打开 Demo Aiden：套餐、积分、出席、家人、App 登录（student_test）显示。
3. My Classroom：5 个班；按年龄→科目→老师；名单每页 20 个；HOA 班是试听。
4. （EduHero 样子）学生编号、每科付款月份栏位出现；（Mirai）不出现。

## E. Calendar 与点名
1. 月历：只显示取消 / 补课 / 额外课（不是所有周课）；日列表、筛选（老师、班级）可用。
2. 今天：Kids Coding 20:30–21:30 出现；Today 页「Classes today」有它，有 Live class / Attendance 按钮。
3. 周视图：课表与 5 个班对得上，没有重叠错位。
4. 点名窗口能打开（**不要按 Take attendance**，除非这项就是被测的功能；本机按也无妨，可 `local:reset` 还原）。

## F. Classroom（老师端）
1. `teacher_test` 的 My Classroom：只有自己的 3 个班。
2. Live class 页能打开（➖ 真 Zoom / 录像）；Question Bank、Class Videos 页能打开不报错。

## G. 权限（最容易出事的地方）
1. 用 `admin_test` 的 My Team → 账号权限窗口：每一页一个勾，勾的结果与上面 A 的菜单一致。
2. View As（dev only）切到每个账号，菜单与 A 一致。
3. 没勾的人手动打网址（如 `/?section=leads`）不会进到页面。
4. 直接用 API 验：`node` 脚本登录 → 查 `leads/students/inbox_chats` 行数：`teacher_test` 只看到自己班的学生；`staff_test` 看不到 students（参考 `docs/local-test-env.md`）。

## H. 学校设定与品牌
1. Class Settings 各分页都能打开（Brand、Student app、Zoom 等），不要按 Save（除非被测）。
2. Mirai 样子：粉色、Mirai 名字；`npm run dev:local -- eduhero` + `npm run local:school -- eduhero`：EduHero 名字、没有 Packages 页/费用栏。
3. Team Replies：打开不报错；按「Work out the days」（本机安全）后出现数字；有 Yesterday 键、渠道区块。

## I. 学生 App（网页）
1. 未登录登录页：Mirai 样子是经典；EduHero 样子（学校设成 Game lobby，窗口 ≥1024 宽）是游戏样式。
2. `student_test` 登录 → 首页：Hi、每日签到/任务、下一堂课（Mon 7:00pm F1 Math）、积分。
3. `parent_test` 登录 → 家长身份，能看到孩子的课与积分。
4. 手机宽度（375）不被切掉，没有横向滚动。
5. 登出再登入正常。

## J. 收尾
1. 浏览器控制台没有红色错误；`npm run build`、`npm test` 过（开发已跑过则写「已跑」）。
2. 做完 `npm run local:stop`。
3. 报告里列：哪些项 ✅、哪些 ❌、哪些 ➖ 以及为什么，附截图路径。
