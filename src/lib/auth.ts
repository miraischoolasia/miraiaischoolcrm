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

// The (login e-mail, password) pairs to try, in order, for what was typed on the sign-in page. First exactly as
// typed (spaces round the username never count). Then, for someone who typed a whole e-mail while their
// username is only the name before "@", that name. Then the password without spaces round it, as phone keyboards
// add one: a password set with such spaces still works, since it is tried first.
export function signInAttempts(username: string, password: string): { email: string; password: string }[] {
  const names = [username.trim()]
  const beforeAt = username.trim().split('@')[0].trim()
  if (username.includes('@') && beforeAt !== '') names.push(beforeAt)
  const passwords = [password]
  if (password.trim() !== password && password.trim() !== '') passwords.push(password.trim())
  const seen = new Set<string>()
  const result: { email: string; password: string }[] = []
  for (const pass of passwords) {
    for (const name of names) {
      const email = usernameToInternalEmail(name)
      const key = `${email}\u0000${pass}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push({ email, password: pass })
      }
    }
  }
  return result
}
