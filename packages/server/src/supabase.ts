import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "./config.js";

/**
 * Two clients, two purposes (design doc §10.5):
 *  - userClient: scoped to the caller's JWT, so RLS applies. Default for requests.
 *  - adminClient: service role, bypasses RLS. Only for trusted jobs acting
 *    outside a single user's scope (shared food tables, signed URLs).
 * Explicit return types keep Supabase's query typing from collapsing across
 * the module boundary.
 */

export function createUserClient(config: Config, accessToken: string): SupabaseClient {
  return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

let admin: SupabaseClient | undefined;

export function getAdminClient(config: Config): SupabaseClient {
  admin ??= createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
