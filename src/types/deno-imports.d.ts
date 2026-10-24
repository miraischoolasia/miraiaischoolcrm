// Server files under supabase/functions that the CRM's tests import name the
// Supabase client the Deno way; for the type check it is the same package.
declare module 'jsr:@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js'
}
