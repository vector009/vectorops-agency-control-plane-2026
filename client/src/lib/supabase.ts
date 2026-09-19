import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface VectorOpsWindow extends Window {
  __VECTOROPS_SUPABASE__?: {
    url?: string;
    anonKey?: string;
    configured?: boolean;
  };
}

const DEFAULT_SUPABASE_URL = "https://yhupkwcdnnclayogfhiv.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wB8ql1D0nO1ffzeHPLZBZg_RP9EUtTs";
const DEFAULT_VECTOROPS_API_URL = "https://yhupkwcdnnclayogfhiv.supabase.co/functions/v1/vectorops-api";

const isPlaceholder = (val?: string) =>
  !val ||
  val.includes("your-project") ||
  val.includes("placeholder") ||
  val.includes("your-key") ||
  val.includes("example.com");

const win = typeof window !== "undefined" ? (window as unknown as VectorOpsWindow) : undefined;
const runtimeWindowConfig = win?.__VECTOROPS_SUPABASE__;

const rawSupabaseUrl =
  (!isPlaceholder(runtimeWindowConfig?.url) ? runtimeWindowConfig?.url : undefined) ||
  (!isPlaceholder(import.meta.env.VITE_SUPABASE_URL) ? import.meta.env.VITE_SUPABASE_URL : undefined) ||
  (!isPlaceholder((import.meta.env as Record<string, string | undefined>).SUPABASE_URL) ? (import.meta.env as Record<string, string | undefined>).SUPABASE_URL : undefined) ||
  DEFAULT_SUPABASE_URL;

const rawPublishableKey =
  (!isPlaceholder(runtimeWindowConfig?.anonKey) ? runtimeWindowConfig?.anonKey : undefined) ||
  (!isPlaceholder(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) ? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY : undefined) ||
  (!isPlaceholder((import.meta.env as Record<string, string | undefined>).SUPABASE_PUBLISHABLE_KEY) ? (import.meta.env as Record<string, string | undefined>).SUPABASE_PUBLISHABLE_KEY : undefined) ||
  (!isPlaceholder((import.meta.env as Record<string, string | undefined>).VITE_SUPABASE_ANON_KEY) ? (import.meta.env as Record<string, string | undefined>).VITE_SUPABASE_ANON_KEY : undefined) ||
  (!isPlaceholder((import.meta.env as Record<string, string | undefined>).SUPABASE_ANON_KEY) ? (import.meta.env as Record<string, string | undefined>).SUPABASE_ANON_KEY : undefined) ||
  DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const cleanSupabaseUrl = rawSupabaseUrl?.trim().replace(/\/+$/, "");
export const cleanPublishableKey = rawPublishableKey?.trim();

export const supabaseConfigured =
  !isPlaceholder(cleanSupabaseUrl) && !isPlaceholder(cleanPublishableKey);

const rawEdgeApiUrl =
  (!isPlaceholder(import.meta.env.VITE_VECTOROPS_API_URL) ? import.meta.env.VITE_VECTOROPS_API_URL : undefined) ||
  DEFAULT_VECTOROPS_API_URL;

export const edgeApiUrl =
  supabaseConfigured && !isPlaceholder(rawEdgeApiUrl)
    ? String(rawEdgeApiUrl).trim().replace(/\/+$/, "")
    : "";

export const supabase: SupabaseClient | null = supabaseConfigured
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

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error("Supabase frontend configuration is missing. Please set your Supabase URL and Publishable Key in Settings.");
  return supabase;
}
