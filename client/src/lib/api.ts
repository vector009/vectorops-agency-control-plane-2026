import { edgeApiUrl, requireSupabase, supabase } from "./supabase";

const nativeFetch = globalThis.fetch.bind(globalThis);

function edgeTarget(input: RequestInfo | URL) {
  if (!edgeApiUrl || typeof input !== "string" || !input.startsWith("/api/")) return null;
  return `${edgeApiUrl}${input}`;
}

/**
 * Uses the local Express API during repository development and the Supabase
 * Edge API when VITE_VECTOROPS_API_URL is configured by a static host.
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const target = edgeTarget(input);
  if (!target) return nativeFetch(input, init);

  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;

  const headers = new Headers(init.headers);
  const publishableKey = String(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY
    || "",
  );
  if (publishableKey) headers.set("apikey", publishableKey);
  if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);

  return nativeFetch(target, { ...init, headers, credentials: "omit" });
}

export async function signInForRole(email: string, password: string, role: "admin" | "client") {
  const client = requireSupabase();
  const result = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (result.error || !result.data.session) throw new Error("Invalid email or password.");

  const response = await apiFetch("/api/auth/me");
  const body = await response.json() as {
    ok?: boolean;
    error?: string;
    user?: { role?: string; slug?: string | null };
  };
  if (!response.ok || !body.ok || body.user?.role !== role) {
    await client.auth.signOut();
    throw new Error(role === "admin"
      ? "This account does not have administrator access."
      : "This account does not have client portal access.");
  }
  return body.user;
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  if (!edgeApiUrl) await nativeFetch("/api/auth/logout", { method: "POST", credentials: "include" });
}
