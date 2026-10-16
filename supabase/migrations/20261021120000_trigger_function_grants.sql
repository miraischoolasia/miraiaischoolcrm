-- Tidy-up for 20261021100000 / 20261021110000: the trigger functions get no
-- EXECUTE for API roles. They could not be called through the API anyway
-- (trigger functions only run as triggers); this clears the Supabase linter
-- warning. Triggers keep firing as before.

revoke all on function public.copy_legacy_review_scores() from public, anon, authenticated;
revoke all on function public.guard_staff_login_not_student() from public, anon, authenticated;
revoke all on function public.link_lesson_log_to_session() from public, anon, authenticated;
revoke all on function public.guard_student_login() from public, anon, authenticated;
revoke all on function public.check_review_score_range() from public, anon, authenticated;
revoke all on function public.guard_review_criterion_scale() from public, anon, authenticated;
