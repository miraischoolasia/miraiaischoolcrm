// Login is username + password, but Supabase Auth speaks email + password.
// We map a teacher's username to a synthetic, never-shown internal email so
// `supabase.auth.signInWithPassword` can be used as-is, with no custom
// password storage of our own.
//
// This exact transform is duplicated verbatim in
// supabase/functions/provision-teacher-auth/index.ts (Deno can't import
// from src/) — keep both copies in sync.
export function usernameToInternalEmail(username: string): string {
  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_')
  return `${normalized}@mirai.internal`
}
