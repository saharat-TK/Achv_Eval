import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/types/database';

/**
 * Supabase client for use in Server Components, Server Actions, and Route Handlers.
 * Reads/writes cookies via the Next.js `cookies()` API.
 *
 * IMPORTANT: this client honors RLS. For privileged operations (system seed,
 * cron jobs, etc.) use `createServiceRoleClient` instead.
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createSSRServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions (which we do — see middleware.ts).
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses RLS. Use ONLY in trusted server contexts.
 * NEVER pass to the browser or expose via API responses.
 */
export function createServiceRoleClient() {
  // Lazy import to avoid loading on edge if not needed.
  const { createClient } = require('@supabase/supabase-js');
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
