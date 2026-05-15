import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types/database';

/**
 * Supabase client for use in Client Components and browser-side code.
 * Reads cookies via `document.cookie` for session continuity with the server.
 */
export function createBrowserClient() {
  return createSSRBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
