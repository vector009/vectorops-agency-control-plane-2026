import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
) as string | undefined;

const isPlaceholder = (val?: string) =>
  !val ||
  val.includes("your-project") ||
  val.includes("placeholder") ||
  val.includes("your-key") ||
  val.includes("example.com");

const cleanSupabaseUrl = supabaseUrl?.trim().replace(/\/+$/, "");
const cleanPublishableKey = supabasePublishableKey?.trim();

export const edgeApiUrl = isPlaceholder(import.meta.env.VITE_VECTOROPS_API_URL)
  ? ""
  : String(import.meta.env.VITE_VECTOROPS_API_URL || "").trim().replace(/\/+$/, "");

export const supabaseConfigured =
  !isPlaceholder(cleanSupabaseUrl) && !isPlaceholder(cleanPublishableKey);

export const supabase = supabaseConfigured
  ? createClient(cleanSupabaseUrl!, cleanPublishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Recovery callbacks are exchanged explicitly by AuthRecovery so an
        // auto-exchange cannot race with its invalid/expired-link handling.
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) throw new Error("Supabase frontend configuration is missing.");
  return supabase;
}
