import { createClient } from "@supabase/supabase-js";

export function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) return null;
  return createClient(url, anon, { auth: { persistSession: false } });
}

