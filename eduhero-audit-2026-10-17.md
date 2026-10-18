# EduHero 检查报告 — 2026-10-17

方法：在 https://eduhero-crm-six.vercel.app 以 Admin 身份只读点过每个页面（没发消息、没改资料），再用只读查询看 EduHero 数据库和 Chatwoot。
没看的：Class Videos / 学生端（别的 session 在做 LMS 迁移）。

## 严重（数据看不全 / 数字是错的）
1. **只有 1000 个学生显示，数据库有 4642 个在读（共 5006）。**
   学生列表一次读取，服务器最多回 1000 行，程序没有分页，所以页面写 "1000 of 1000 students"，名字从 A 排到 "CLARICE…" 就没了；搜索、班级人数（每班显示 13，实际约 43）、Needs follow-up 都是错的。
   同样的问题：`people`（家庭卡）写了 limit 5000，但表里有 6524 行。
   修法：学生和 people 改成分页读取（每次 1000，读到没有为止）。
2. **没有套餐的学校，每个学生都被标成"需要处理"。**
   每个学生：Package "No package"、Classes left 0、Ends "Dec 31, 2099 in 26738 days"、状态红色 "No classes left"、有 Renew 按钮；Students 页写 "930 need follow-up"；My Classroom 每个班都 "Need Attention"。而 Today 页却写 "Everyone is on track"（两处算法不一致）。
   修法：不收费的品牌不计算"剩几堂/到期"，隐藏 Package / Classes left / Ends / Renew，状态只看是否在读。
3. **Instagram 的聊天几乎全是"未读"：** Chatwoot 里 699 个 Instagram 聊天，672 个算未读（共 4217 条消息），其中 236 个的最后一条家长消息已超过 3 天。结果 Instagram 红点 99+，Unread 标签会自动连续加载几百行（最多 60 次请求），真正的新消息淹没在里面。
   修法：把导入的旧聊天标成已读（要在 Chatwoot 数据库里执行 SQL，需要你来执行），并让导入程序以后直接设为已读。
4. **没有人认领聊天，lead 也没人跟：** 785 个聊天全是 "No one yet"；758 个 lead 的 PIC 全是 "Not assigned"；757 个还是 "New"，0 个 "Contacted"，转化率 0%。

## 中等
5. Lead 阶段是 Mirai 的（New / Contacted / Trial Scheduled / Trial Completed / Converted / Lost），EduHero 没有试课，需要自己的阶段（"Manage stages" 可以改）。
6. Lead 来源：601 个是 "Other"（共 758）；来源规则 0 条，所以 Instagram/Facebook 来的没被归到 Social Media / Advertisement。
7. 标签里有杂项：`wa: +60183644133`（电话当标签）、`purchase_sej obj`；命名风格不统一（全小写、有的带连字号、有的带斜线）。
8. 完全没有自动化：Automations 0 个流程，快捷回复 0 条，表单 0 个，来源规则 0 条。93 个未读、18 个等了超过 30 分钟，全部靠手回（AI 回复草稿已经有 10 条知识）。
9. 班级年龄组用的是 Mirai 的（6-8 / 9-11 / 12-14 / 15-17 Years Old），而班级是 Form 1–5 / Year 3–6；108 个班都没有归到 Programme，Students 的 F1 SEJ / F2 SEJ 标签是 0，全部在 "Other"。
10. Instagram 有重复聊天：同一个人两个聊天（例如 LEE EN QI 和 李恩祈，内容一模一样）；Chatwoot 里 27 个联系人有 2 个聊天以上。
11. 账号：4 个老师没有登录账号，21 个 Staff 显示 "No access yet"，有 admin@example.com 的示范账号。
12. 在 Meta/GoHighLevel 里发出的回复，头像显示 "U"（未知），看不出是谁回的；团队回复统计也会不准。

## 小的
13. WhatsApp 标签排在第一个但是空的（EduHero 的 WhatsApp 还没配对）。
14. Calendar 没有任何课表，"No classes today"，Attendance 没人用（LMS 迁移后才会有）。

## 对的 / 正常
- Follow up 铃铛、"Suggest a reply"、页面名 / 来源标签、Leads 的 Board / Dashboard 都正常。
- 费用界面已隐藏（Packages、Account Fee 等），页面里没有 Mirai / HOA / Holiday Camp 字样。
