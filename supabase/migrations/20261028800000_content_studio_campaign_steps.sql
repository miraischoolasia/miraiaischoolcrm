-- Content Studio: what the owner asked for after trying phase 1 (2026-10-22).
--
-- 1. A campaign starts one of two ways: the team types the details itself ('manual'), or uploads its
--    material (PDFs, pictures and any text it already has) and the AI reads it and fills the details in
--    ('upload'). source_text keeps the text that was pasted for the AI to read.
-- 2. How many posts of each type, set apart: e.g. 10 single posters + 20 carousels (each N pages) +
--    5 captions only. The old item_count / kind columns stay for phase-1 campaigns; the counts below are
--    filled from them so nothing changes for those.
-- 3. More starting styles and angles for tuition and children's education in Malaysia (each school can
--    still add its own and hide any). Only names the school does not have yet are added.

alter table public.content_briefs
  add column source_mode text not null default 'manual' check (source_mode in ('manual', 'upload')),
  add column source_text text not null default '' check (char_length(source_text) <= 8000),
  add column single_count integer not null default 0 check (single_count between 0 and 30),
  add column carousel_count integer not null default 0 check (carousel_count between 0 and 30),
  add column caption_count integer not null default 0 check (caption_count between 0 and 30);

update public.content_briefs
set single_count = case when kind = 'single' then item_count else 0 end,
    carousel_count = case when kind = 'carousel' then item_count else 0 end,
    caption_count = case when kind = 'caption' then item_count else 0 end;

comment on column public.content_briefs.source_mode is
  'manual = the team typed the details; upload = the AI read the uploaded material and filled them in.';
comment on column public.content_briefs.single_count is
  'How many single posters to plan (with carousel_count and caption_count; item_count and kind are phase 1).';

-- The AI reading a campaign's material is one more kind of use.
alter table public.content_ai_usage drop constraint if exists content_ai_usage_action_check;
alter table public.content_ai_usage
  add constraint content_ai_usage_action_check
  check (action in ('plan', 'more', 'read_pdf', 'analyze', 'image'));

-- ---------------------------------------------------------------------------------------------------------
-- More starting styles and angles.
-- ---------------------------------------------------------------------------------------------------------

insert into public.content_styles (name, description, sort_order)
select v.name, v.description, v.sort_order
from (values
  ('3D 立体卡通', '圆润的 3D 卡通人物和道具（像动画电影），柔和光影、糖果色，标题用立体粗字，适合小学生家长。', 50),
  ('黑板粉笔', '深绿色黑板底、白色和彩色粉笔字和手绘线条，像课室里老师写的重点，亲切有学习感。', 60),
  ('漫画分格', '日系或港漫风格的分格小漫画，对话框讲出家长或孩子的心声，适合讲故事和痛点。', 70),
  ('手绘水彩', '温柔的水彩插画、纸张纹理、手写感标题，温暖安心，适合幼儿和低年级。', 80),
  ('扁平插画', '干净的扁平矢量插画、几何形状、明亮配色，现代简洁，信息清楚。', 90),
  ('杂志封面', '像杂志封面：一个主角人物大照片、超大标题、几行小标题，高级有质感。', 100),
  ('强烈促销', '红黄强烈对比、爆炸框、倒数字和大价钱，一眼看到优惠、名额和截止日期。', 110),
  ('科技未来', '深蓝或黑底、发光线条、机器人和电路元素，适合 coding、AI、机器人课程。', 120),
  ('温馨家庭', '家长陪孩子学习的温暖画面、暖色调、柔和光线，讲陪伴和成长。', 130),
  ('信息图表', '用图标、数字和箭头整理重点（课程内容、时间表、步骤），一张看懂。', 140),
  ('开学校园', '书包、文具、课室和校园元素，清新明亮，适合开学季和新学期招生。', 150)
) as v(name, description, sort_order)
where not exists (select 1 from public.content_styles s where lower(btrim(s.name)) = lower(v.name));

insert into public.content_angles (name, description, examples, sort_order)
select v.name, v.description, v.examples, v.sort_order
from (values
  ('学生作品', '展示学生做出来的作品（作文、画、程序、机器人），让家长看到孩子学到的成果。',
    array['10岁小朋友自己做的第一个游戏', '看看孩子们这个月的作品'], 60),
  ('课堂花絮', '真实上课的有趣片段和气氛，让家长感受到孩子在这里开心又专心。',
    array['今天的课堂笑声不断', '原来上课可以这么好玩'], 70),
  ('常见问题', '回答家长最常问的问题（几岁可以学、上课时间、怎样收费、跟不上怎么办）。',
    array['孩子几岁可以开始学？', '家长最常问的 5 个问题'], 80),
  ('前后对比', '学习前和学习后的对比（成绩、自信、习惯），用事实说话，不夸大。',
    array['3个月前 vs 现在', '从怕开口到敢上台'], 90),
  ('早鸟优惠', '提早报名的优惠，写清楚截止日期和省多少钱。',
    array['早鸟价只到月底', '现在报名省 RM50'], 100),
  ('开学季', '开学或新学期的准备，帮家长提早规划孩子的学习。',
    array['新学期，先打好基础', '开学前最后一个报名机会'], 110),
  ('考试冲刺', '考试前的冲刺班或复习重点，帮孩子在考试前稳住成绩。',
    array['UASA 冲刺班开始报名', '考前 4 周，重点一次复习'], 120),
  ('家长见证', '家长亲口分享的回馈和改变（文字或截图），真实可信。',
    array['家长说：孩子回家会主动温习了', '听听其他家长怎么说'], 130),
  ('节日祝福', '节日问候加轻松的学习信息，拉近和家长的距离。',
    array['开斋节快乐！', '新年快乐，新一年一起进步'], 140),
  ('学习小贴士', '给家长或孩子实用的小方法（记单词、专注、时间管理），建立专业信任。',
    array['3 个方法让孩子写功课不拖拉', '每天 10 分钟，英文进步更快'], 150)
) as v(name, description, examples, sort_order)
where not exists (select 1 from public.content_angles a where lower(btrim(a.name)) = lower(v.name));
