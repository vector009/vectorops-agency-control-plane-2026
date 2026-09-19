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
  const cleanEmail = email.trim().toLowerCase();
  const result = await client.auth.signInWithPassword({ email: cleanEmail, password });
  if (result.error || !result.data.session) {
    throw new Error(result.error?.message || "Invalid email or password.");
  }

  // 1. If an edge or external backend is configured, attempt /api/auth/me verification
  let userProfile: { role?: string; slug?: string | null } | null = null;
  if (edgeApiUrl) {
    try {
      const response = await apiFetch("/api/auth/me");
      if (response.ok) {
        const body = (await response.json()) as {
          ok?: boolean;
          error?: string;
          user?: { role?: string; slug?: string | null };
        };
        if (body.ok && body.user) {
          userProfile = body.user;
        }
      }
    } catch {
      // Fallback to direct Supabase profile query below
    }
  }

  // 2. Direct Supabase verification from public.profiles table
  if (!userProfile) {
    const { data: profile, error: profileErr } = await client
      .from("profiles")
      .select("user_id, role, client_id, full_name")
      .eq("user_id", result.data.user.id)
      .maybeSingle();

    if (profileErr) {
      throw new Error(`Connected to Supabase, but profile check failed: ${profileErr.message}`);
    }
    if (!profile) {
      await client.auth.signOut();
      throw new Error(
        "No matching profile found in the 'profiles' table for this user. Ensure a profile row exists with role = 'admin' or 'client'.",
      );
    }

    let slug: string | null = null;
    if (profile.client_id) {
      const { data: portal } = await client
        .from("client_portal_config")
        .select("slug")
        .eq("client_id", profile.client_id)
        .maybeSingle();
      slug = portal?.slug || null;
    }

    userProfile = { role: profile.role, slug };
  }

  if (userProfile.role !== role) {
    await client.auth.signOut();
    throw new Error(
      role === "admin"
        ? "This account does not have administrator access."
        : "This account does not have client portal access.",
    );
  }

  return userProfile;
}

export async function getCurrentUser(): Promise<{ role?: string; slug?: string | null } | null> {
  if (supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        if (edgeApiUrl) {
          try {
            const res = await apiFetch("/api/auth/me");
            if (res.ok) {
              const body = (await res.json()) as { ok?: boolean; user?: { role?: string; slug?: string | null } };
              if (body.ok && body.user) return body.user;
            }
          } catch {
            // fallback to direct query
          }
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id, role, client_id")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (profile) {
          let slug: string | null = null;
          if (profile.client_id) {
            const { data: portal } = await supabase
              .from("client_portal_config")
              .select("slug")
              .eq("client_id", profile.client_id)
              .maybeSingle();
            slug = portal?.slug || null;
          }
          return { role: profile.role, slug };
        }
      }
    } catch {
      // Continue to try backend session
    }
  }

  try {
    const response = await apiFetch("/api/auth/me");
    if (response.ok) {
      const body = (await response.json()) as { ok?: boolean; user?: { role?: string; slug?: string | null } };
      if (body.ok && body.user) return body.user;
    }
  } catch {
    // Unauthenticated
  }
  return null;
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  if (!edgeApiUrl) await nativeFetch("/api/auth/logout", { method: "POST", credentials: "include" });
}
