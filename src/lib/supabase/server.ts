import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getSupabaseEnv } from "./env";

export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseEnv();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components não podem gravar cookies. O proxy mantém a
          // sessão atualizada antes da renderização.
        }
      },
    },
  });
}

export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { url, publishableKey } = getSupabaseEnv();
    const healthUrl = new URL("/auth/v1/health", url);
    const response = await fetch(healthUrl, {
      cache: "no-store",
      headers: {
        apikey: publishableKey,
      },
      signal: AbortSignal.timeout(5_000),
    });

    return response.ok;
  } catch {
    return false;
  }
}
