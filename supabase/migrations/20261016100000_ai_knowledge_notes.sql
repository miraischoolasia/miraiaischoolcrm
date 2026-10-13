-- The school knowledge of the AI reply drafts, as notes an admin edits in the CRM.
--
-- Until now the facts the AI may use were a text file bundled with the `ai-draft` function, so every
-- change meant a deploy. They now live here as separate notes (the school, the way we talk, the
-- conversation steps, HOA, regular classes, Holiday Camp, answers we have confirmed, what is still
-- missing). The function reads every note that is switched on, in order, before it writes a draft; when
-- there are no notes at all it falls back to the text bundled with it.
--
-- * Everybody who can see Leads can read the notes (they use the AI); only an admin can add, change,
--   switch on/off, reorder or remove one.
-- * Every time a note's title or text changes, the previous wording is kept in
--   ai_knowledge_note_versions (the last 30 per note) so it can be put back. Only an admin reads them.
-- * At most 30 notes of up to 20000 characters each.
-- * The first time, the notes are filled with the knowledge the AI has been using, so nothing changes
--   until someone edits a note.

create table if not exists public.ai_knowledge_notes (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null default '' check (char_length(body) <= 20000),
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create index if not exists ai_knowledge_notes_order_idx on public.ai_knowledge_notes (sort_order, id);

-- The wording a note had before it was changed. written_at / written_by say when and by whom that
-- wording was last saved.
create table if not exists public.ai_knowledge_note_versions (
  id bigint generated always as identity primary key,
  note_id bigint not null references public.ai_knowledge_notes (id) on delete cascade,
  title text not null,
  body text not null,
  written_at timestamptz not null,
  written_by uuid
);

create index if not exists ai_knowledge_note_versions_note_idx
  on public.ai_knowledge_note_versions (note_id, id desc);

-- ---------------------------------------------------------------------------------------------
-- Keeping the old wording, and who changed what when
-- ---------------------------------------------------------------------------------------------

create or replace function public.ai_knowledge_notes_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.ai_knowledge_notes) >= 30 then
    raise exception 'There can be up to 30 notes.';
  end if;
  new.title := btrim(new.title);
  new.sort_order := coalesce((select max(sort_order) from public.ai_knowledge_notes), 0) + 10;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.ai_knowledge_notes_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  if old.title is distinct from new.title or old.body is distinct from new.body then
    insert into public.ai_knowledge_note_versions (note_id, title, body, written_at, written_by)
    values (old.id, old.title, old.body, old.updated_at, old.updated_by);
    delete from public.ai_knowledge_note_versions
    where note_id = old.id
      and id not in (
        select id from public.ai_knowledge_note_versions where note_id = old.id order by id desc limit 30
      );
  end if;
  -- Moving a note up or down is not an edit: leave "last changed" alone.
  if old.title is distinct from new.title
     or old.body is distinct from new.body
     or old.enabled is distinct from new.enabled then
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists ai_knowledge_notes_before_insert on public.ai_knowledge_notes;
create trigger ai_knowledge_notes_before_insert
before insert on public.ai_knowledge_notes
for each row execute function public.ai_knowledge_notes_before_insert();

drop trigger if exists ai_knowledge_notes_before_update on public.ai_knowledge_notes;
create trigger ai_knowledge_notes_before_update
before update on public.ai_knowledge_notes
for each row execute function public.ai_knowledge_notes_before_update();

-- ---------------------------------------------------------------------------------------------
-- Who can do what
-- ---------------------------------------------------------------------------------------------

alter table public.ai_knowledge_notes enable row level security;
alter table public.ai_knowledge_note_versions enable row level security;

create policy "ai_knowledge_notes_select_permitted"
on public.ai_knowledge_notes
for select to authenticated
using ((select public.has_permission('leads')));

create policy "ai_knowledge_notes_insert_admin"
on public.ai_knowledge_notes
for insert to authenticated
with check ((select public.is_admin()));

create policy "ai_knowledge_notes_update_admin"
on public.ai_knowledge_notes
for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "ai_knowledge_notes_delete_admin"
on public.ai_knowledge_notes
for delete to authenticated
using ((select public.is_admin()));

create policy "ai_knowledge_note_versions_select_admin"
on public.ai_knowledge_note_versions
for select to authenticated
using ((select public.is_admin()));

revoke all on public.ai_knowledge_notes from anon, authenticated;
revoke all on public.ai_knowledge_note_versions from anon, authenticated;
grant select on public.ai_knowledge_notes to authenticated;
grant insert (title, body, enabled) on public.ai_knowledge_notes to authenticated;
grant update (title, body, enabled) on public.ai_knowledge_notes to authenticated;
grant delete on public.ai_knowledge_notes to authenticated;
grant select on public.ai_knowledge_note_versions to authenticated;

-- Puts the notes in the order of the ids given (the first id is read first by the AI).
create or replace function public.reorder_ai_knowledge_notes(p_ids bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Only an admin can change the AI knowledge.';
  end if;
  update public.ai_knowledge_notes as n
  set sort_order = ordered.position * 10
  from unnest(p_ids) with ordinality as ordered (id, position)
  where n.id = ordered.id;
end;
$$;

revoke all on function public.reorder_ai_knowledge_notes(bigint[]) from public, anon;
grant execute on function public.reorder_ai_knowledge_notes(bigint[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The knowledge the AI has been using so far, as the first notes
-- ---------------------------------------------------------------------------------------------

insert into public.ai_knowledge_notes (sort_order, title, body)
select * from (values
    (10, '学校', $note$- Mirai AI School，7 年 Coding 教学经验（Since 2019）。
- 让中小学生就能学到大学的技能，让大学生和职场小白拥有比别人更有竞争力的实战技能。
- 计划教 7-25 岁；目前教 7-17 岁的 AI Coding 和 AI Tools；2026 年课程已经延伸到 AI、Coding、Robotic。
- 全面 Online，上课用 **Zoom**，**必须用电脑**（学习 Coding 和 AI 工具比较兼容电脑）。
- 联络：010-807 9133，miraischool.asia
- 教学理念：S.V.L.R. = Solve + Value + Leadership = Real World Combat（让孩子能解决问题、提升自身价值、并带领身边的人）。$note$),
    (20, '说话方式', $note$- 用「你」，不用「您」；叫家长「妈咪」。
- **永远不说「你家孩子」「您的孩子」**，只说「孩子」「那孩子」「将孩子」。
- 句尾用：哦、啦、咯、呢、的；英文词照常混着讲（receipt、form、Zoom、weekend、weekday）。
- 短句、一行一件事、适度表情符号（😊😍🥰）。
- 一次只问一件事。不重复问家长已经回答过的。$note$),
    (30, '对话流程', $note$1. 介绍自己
2. 问孩子几岁
3. 问孩子有没有玩过电脑 / 常不常玩
4. 问有没有用过 ChatGPT、Gemini 这类 AI 工具
5. 介绍课程（视频 + 文字）
6. 一句话讲重点。HOA：「所以我们这次的 120 分钟是让孩子从用 AI"问答案"，到用 AI"创造"😍」
7. 主动问：如果孩子会报名这次的课程，prefer weekend 还是 weekday？
8. 时间定了，就让家长付课程费用
9. **付了费用才给家长填报名表，并 confirm calendar 的时间**

价钱放在第 8 步，前面的回复不主动讲价钱。$note$),
    (40, 'HOA', $note$- **不是体验课。它是一个 120 分钟的 Coding + AI 课程。** 不写「体验课」「试试看」。
- 年龄：6-16 岁（6 岁可以）。
- 费用：原价 RM99，现在报名优惠 RM38。这个优惠一直都有；不编截止日期，不编「只剩几个位置」。
- 五个重点：测试孩子 AI 的能力；测试解决问题与逻辑思维；了解 AI 与 Coding 的底层逻辑；亲手创造游戏（让玩游戏变成竞争优势）；亲手打造 Website（学变现赚钱能力）。
- 孩子从用 AI"问答案"，变成用 AI"创造"。
- 例子：14 岁 HOA 学生做 Mario 华文学习游戏；14 岁孩子用 AI 做华文成语游戏（有视频）。
- 视频（Drive「Hour Of AI」文件夹）：HOA Video Highlight.mp4、14岁孩子用AI做华文成语游戏.mp4
- **上课方式：** 老师讲解 10-15 分钟，剩下的时间都是孩子自己动手实战，做自己的游戏和 Website；不会就举手问老师。
- **不是一对一，是小班，1 位老师。** 每堂最多人数：6-8 岁 3 位；9-11 岁 8 位；12-14 岁 15 位；15-16 岁 20 位。
- 时间：以 calendar 里真实有位置的时间为准，不自己编。
  - 目前 9-11 岁组：星期四 5pm-7pm、星期六 2pm-4pm、星期日 4.30pm-6.30pm（每周）。
- **HOA 之后：** 安排一个 30 分钟的 Zoom，讲解孩子的情况，以及之后怎么帮助孩子用 AI 提升竞争力。$note$),
    (50, '常见问答', $note$**家长问「你们是一对一吗？」（孩子 9 岁）**
> 9 岁的班级最多是 8 位的哦～
> 因为上课方式是老师讲解 10-15 分钟之后，剩下的时间都是孩子实战，
> 所以孩子完全可以专注学习，不会就举手问老师就可以了哦😊
> 那孩子星期六 2pm 还是星期日 4.30pm 比较方便呢？

**家长问「你们是 online 还是实体课？」**
> 我们全部都是 online 的哦～（用 Zoom 上课，需要用电脑）
> 那孩子星期六 2pm 还是星期日 4.30pm 比较方便呢？

**家长说「online 我怕孩子不专心」**
> 我明白的妈咪～online 会担心孩子不专心是正常的哦😊
> 不过我们的课程不是像 normal 补习的学习方式，一直听老师讲的，
> 我们的课程是老师讲解 10-15 分钟之后，剩下的时间都是孩子自己动手实战，做自己的游戏跟 Website，
> 而且这次的 HOA 120 分钟的课程就是很好让孩子先感受我们的老师和教学方式，这样我们就可以了解双方的情况，来决定适不适合继续和我们学习 AI 课程哦😍
> 那孩子星期六 2pm 还是星期日 4.30pm 比较方便呢？

**家长问「你们之后的课程是怎样呢？」**
> 妈咪，after 这个 HOA 课程之后，我们会安排一个 30 分钟的 Zoom 讲解孩子的情况和之后怎么帮助孩子用 AI 提升竞争力
> 我们之后的课程是教孩子 AI Coding，让孩子学会用 AI 做系统，然后考取 Programmer 技术证书哦！
> 所以等孩子上完 HOA 之后，我们会安排 Zoom 跟你详细讲解的~

**家长问「之后的学费多少？」**（问了才说）
> 之后的课程一个月平均是 RM200 - 300 之间哦～（已经包含 Account Fee 和 Mirai Club Fee）
> 一个月 4 堂课，一堂课 1 个小时
> 具体怎么安排，上完 HOA 之后的 Zoom 我们会跟你详细讲解的😊

**家长问「可不可以 5pm？」**（calendar 里没有的时间）
> 不答应、不乱承诺。给 calendar 里最接近的真实时间，再补一个刚好的选项。
> 例：星期六只有 2pm，星期日 4.30pm 最接近 5pm；weekday 的话星期四是 5pm。$note$),
    (60, '正课', $note$- AI 只简单讲：之后教 AI Coding，学会用 AI 做系统，可考 Programmer 技术证书；一个月 4 堂，一堂 1 小时。
- 价钱：问了才说，一个月平均 RM200-300（含 Account Fee 和 Mirai Club Fee）。
- 细节（几个月配套等）：不在 WhatsApp 讲，留给家长 Zoom。$note$),
    (70, 'Holiday Camp', $note$- 10-16 岁；Online；3 个月 12 堂课；学会 12 个 AI Tools；可以考取 3 张 AI 证书（Google Gemini AI Cert、IBM AI Cert、Mirai AI School AI Cert）。
- 原价 RM588，假期限定 RM350。
- 内容：Idea → 计划/产品 → 图片 → Poster → Story Board → AI Video → Landing Page → Website。
- 时间表（每堂 1 小时）：10-12 岁：星期六 2pm-3pm、星期日 3.30pm-4.30pm；13-14 岁：星期六 10am-11am、星期日 2pm-3pm；15-16 岁：星期六 3.30pm-4.30pm、星期日 10am-11am。
- **你说 Camp 的流程和 HOA 不一样，等你讲了再补。**$note$),
    (80, '资料缺口', $note$- **付款方式：** 家长怎么付 RM38？（户口号码、QR、还是链接）
- **报名表格：** 付了费用后给家长的是哪一份表格？
- 家长坚持要 calendar 里没有的时间，你们可不可以特别开班？
- 6-8 岁、15-16 岁的上课方式是否也是「讲解 10-15 分钟，其余实战」？
- Holiday Camp 的对话流程。
- 退款、投诉、孩子生病请假怎么处理。$note$)
) as seed (sort_order, title, body)
where not exists (select 1 from public.ai_knowledge_notes);

