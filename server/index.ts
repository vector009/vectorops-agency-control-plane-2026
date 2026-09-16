import express, { type Request, type Response } from "express";
import { createServer } from "http";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { store } from "./store";
import { N8nControlPlane, startN8nControlScheduler, type N8nWorkflowDefinition } from "./n8n-control";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_COOKIE = "vectorops_session";
const isProduction = process.env.NODE_ENV === "production";
const authAttempts = new Map<string, { count: number; resetAt: number }>();
const integrationAttempts = new Map<string, { count: number; resetAt: number }>();
const developmentSessionSecret = randomBytes(32).toString("base64url");
let n8nControlPlane: N8nControlPlane | null = null;

type Session = {
  access_token: string;
  refresh_token?: string;
  local_admin?: boolean;
  user_id?: string;
  role?: "admin" | "client";
  client_id?: string | null;
  slug?: string;
};

type Profile = {
  user_id: string;
  role: "admin" | "client";
  client_id: string | null;
  full_name: string | null;
};

function config() {
  return {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    anonKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export const isSupabaseConfigured = () => {
  const { url, anonKey, serviceRoleKey } = config();
  return Boolean(url && anonKey && serviceRoleKey);
};

function sessionSecret() {
  return process.env.SESSION_SECRET || (isProduction ? null : developmentSessionSecret);
}

function signSession(payload: string) {
  const secret = sessionSecret();
  if (!secret) throw new Error("SESSION_SECRET is required");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function serializeSession(session: Session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${signSession(payload)}`;
}

export function parseSession(value: string | null): Session | null {
  if (!value) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return null;

  const expected = signSession(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    return session && typeof session.access_token === "string" ? session : null;
  } catch {
    return null;
  }
}

function createAnonClient() {
  const { url, anonKey } = config();
  if (!url || !anonKey) throw new Error("Supabase client configuration is incomplete");
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function createAuthenticatedClient(accessToken: string) {
  const { url, anonKey } = config();
  if (!url || !anonKey) throw new Error("Supabase client configuration is incomplete");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function createServiceClient(): SupabaseClient {
  const { url, serviceRoleKey } = config();
  if (!url || !serviceRoleKey) throw new Error("Supabase server configuration is incomplete");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getN8nControlPlane() {
  if (!isSupabaseConfigured()) throw new Error("Supabase is required for n8n synchronization");
  if (!n8nControlPlane) {
    n8nControlPlane = new N8nControlPlane(createServiceClient(), {
      allowInsecureHttp: process.env.N8N_ALLOW_INSECURE_HTTP === "true" && !isProduction,
      executionLimit: Number(process.env.N8N_EXECUTION_SYNC_LIMIT || 50),
    });
  }
  return n8nControlPlane;
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.cookie || "";
  const item = cookieHeader.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

function writeSession(response: Response, session: Session) {
  const value = encodeURIComponent(serializeSession(session));
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=${value}; Max-Age=${60 * 60 * 12}; Path=/; HttpOnly; SameSite=Lax${isProduction ? "; Secure" : ""}`);
}

function clearSession(response: Response) {
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${isProduction ? "; Secure" : ""}`);
}

function authRateLimit(request: Request, response: Response) {
  const key = request.ip || request.headers["x-forwarded-for"]?.toString() || "unknown";
  const now = Date.now();
  const current = authAttempts.get(key);
  if (!current || current.resetAt <= now) {
    authAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (current.count >= 20) {
    response.setHeader("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
    response.status(429).json({ ok: false, error: "Too many attempts. Please wait 15 minutes and try again." });
    return false;
  }
  current.count += 1;
  return true;
}

function genericAuthFailure(response: Response, message = "Invalid email or password.") {
  return response.status(401).json({ ok: false, error: message });
}

function sessionFromRequest(request: Request) {
  return parseSession(readCookie(request, SESSION_COOKIE));
}

type VerifiedSession = {
  session: Session;
  profile: Profile;
  userClient?: SupabaseClient;
};

async function verifySession(request: Request, response: Response): Promise<VerifiedSession | null> {
  const session = sessionFromRequest(request);
  if (!session?.role) return null;

  if (!isSupabaseConfigured()) {
    if (isProduction || !session.access_token.startsWith("token-") || !session.user_id) return null;
    const profile = store.profiles.find((item) => item.user_id === session.user_id);
    if (!profile || profile.role !== session.role || profile.client_id !== (session.client_id ?? null)) return null;
    return { session, profile };
  }

  if (session.access_token.startsWith("token-")) return null;

  let accessToken = session.access_token;
  let auth = createAnonClient();
  let userResult = await auth.auth.getUser(accessToken);

  if ((userResult.error || !userResult.data.user) && session.refresh_token) {
    const refreshed = await auth.auth.refreshSession({ refresh_token: session.refresh_token });
    if (refreshed.error || !refreshed.data.session || !refreshed.data.user) return null;
    accessToken = refreshed.data.session.access_token;
    session.access_token = accessToken;
    session.refresh_token = refreshed.data.session.refresh_token;
    userResult = { data: { user: refreshed.data.user }, error: null } as typeof userResult;
    writeSession(response, session);
  }

  if (userResult.error || !userResult.data.user) return null;
  const profile = await profileForUser(createServiceClient(), userResult.data.user.id);
  if (!profile || profile.user_id !== session.user_id || profile.role !== session.role) return null;
  if (profile.role === "client" && (!profile.client_id || profile.client_id !== session.client_id)) return null;
  if (profile.role === "admin" && profile.client_id !== null) return null;

  return { session, profile, userClient: createAuthenticatedClient(accessToken) };
}

async function profileForUser(service: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await service.from("profiles").select("user_id,role,client_id,full_name").eq("user_id", userId).limit(1).maybeSingle();
  if (error || !data) return null;
  return data as Profile;
}

// --------------------------------------------------------------------------
// AUTHENTICATION CONTROLLERS (SUPABASE AUTH + PROFILES RBAC)
// --------------------------------------------------------------------------

async function adminLogin(request: Request, response: Response) {
  if (!authRateLimit(request, response)) return;
  const { email, password } = request.body as { email?: unknown; password?: unknown };

  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password.trim()) {
    return response.status(400).json({ ok: false, error: "Email and password are required." });
  }

  const cleanEmail = email.trim().toLowerCase();
  const submittedPassword = password;

  // Mode 1: Supabase Cloud Connected Mode
  if (isSupabaseConfigured()) {
    try {
      const anon = createAnonClient();
      const authResult = await anon.auth.signInWithPassword({ email: cleanEmail, password: submittedPassword });

      if (authResult.error || !authResult.data.session || !authResult.data.user) {
        return genericAuthFailure(response);
      }

      const service = createServiceClient();
      const profile = await profileForUser(service, authResult.data.user.id);

      // Verify role = admin (Role-Based Access Control)
      if (!profile || profile.role !== "admin") {
        await anon.auth.signOut();
        return response.status(403).json({ ok: false, error: "Access denied. Administrator privileges required." });
      }

      writeSession(response, {
        access_token: authResult.data.session.access_token,
        refresh_token: authResult.data.session.refresh_token,
        role: "admin",
        user_id: authResult.data.user.id,
      });

      return response.json({
        ok: true,
        role: "admin",
        name: profile.full_name || "VectorOps Admin",
        email: cleanEmail,
      });
    } catch {
      return response.status(503).json({ ok: false, error: "Authentication service temporarily unavailable." });
    }
  }

  // Mode 2: Local Resilience Store (Mirrors Supabase Auth & public.profiles)
  const authUser = store.authUsers.get(cleanEmail);
  if (!authUser) {
    return genericAuthFailure(response);
  }

  if (submittedPassword !== authUser.password) {
    return genericAuthFailure(response);
  }

  const profile = store.profiles.find((p) => p.user_id === authUser.id);
  if (!profile || profile.role !== "admin") {
    return response.status(403).json({ ok: false, error: "Access denied. Administrator privileges required." });
  }

  writeSession(response, {
    access_token: `token-${authUser.id}`,
    local_admin: true,
    user_id: authUser.id,
    role: "admin",
  });

  return response.json({
    ok: true,
    role: "admin",
    name: profile.full_name || "VectorOps Admin",
    email: cleanEmail,
  });
}

async function clientLogin(request: Request, response: Response) {
  if (!authRateLimit(request, response)) return;
  const { email, password } = request.body as { email?: unknown; password?: unknown };

  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password.trim()) {
    return response.status(400).json({ ok: false, error: "Email and password are required." });
  }

  const cleanEmail = email.trim().toLowerCase();
  const submittedPassword = password;

  // Mode 1: Supabase Cloud Connected Mode
  if (isSupabaseConfigured()) {
    try {
      const anon = createAnonClient();
      const authResult = await anon.auth.signInWithPassword({ email: cleanEmail, password: submittedPassword });

      if (authResult.error || !authResult.data.session || !authResult.data.user) {
        return genericAuthFailure(response);
      }

      const service = createServiceClient();
      const profile = await profileForUser(service, authResult.data.user.id);

      // Verify role = client & obtain client_id (admin cannot be treated as client!)
      if (!profile || profile.role !== "client" || !profile.client_id) {
        await anon.auth.signOut();
        return response.status(403).json({ ok: false, error: "This account is not authorized for client portal access." });
      }

      // Verify client account is active
      const clientRecord = await service.from("clients").select("id,status").eq("id", profile.client_id).limit(1).maybeSingle();
      if (clientRecord.error || !clientRecord.data || clientRecord.data.status === "churned" || clientRecord.data.status === "archived") {
        await anon.auth.signOut();
        return response.status(403).json({ ok: false, error: "This client portal is currently inactive." });
      }

      // Obtain portal config securely using authenticated profile.client_id
      const portal = await service.from("client_portal_config").select("client_id,slug,portal_title").eq("client_id", profile.client_id).limit(1).maybeSingle();
      if (portal.error || !portal.data) {
        await anon.auth.signOut();
        return response.status(404).json({ ok: false, error: "Portal configuration not found for this client." });
      }

      writeSession(response, {
        access_token: authResult.data.session.access_token,
        refresh_token: authResult.data.session.refresh_token,
        role: "client",
        user_id: authResult.data.user.id,
        client_id: profile.client_id,
        slug: portal.data.slug,
      });

      return response.json({
        ok: true,
        role: "client",
        slug: portal.data.slug,
        title: portal.data.portal_title,
      });
    } catch {
      return response.status(503).json({ ok: false, error: "Authentication service temporarily unavailable." });
    }
  }

  // Mode 2: Local Resilience Store (Mirrors Supabase Auth & public.profiles)
  const authUser = store.authUsers.get(cleanEmail);
  if (!authUser || submittedPassword !== authUser.password) {
    return genericAuthFailure(response);
  }

  const profile = store.profiles.find((p) => p.user_id === authUser.id);
  // Verify role = client & obtain client_id (admin cannot be treated as client)
  if (!profile || profile.role !== "client" || !profile.client_id) {
    return response.status(403).json({ ok: false, error: "This account is not authorized for client portal access." });
  }

  const client = store.clients.find((c) => c.id === profile.client_id);
  if (!client || client.status === "churned" || client.status === "archived") {
    return response.status(403).json({ ok: false, error: "This client portal is currently inactive." });
  }

  // Obtain portal config using securely obtained client_id
  const portal = store.portalConfigs[profile.client_id] || Object.values(store.portalConfigs).find((p) => p.client_id === profile.client_id);
  if (!portal) {
    return response.status(404).json({ ok: false, error: "Portal configuration not found for this client." });
  }

  writeSession(response, {
    access_token: `token-${authUser.id}`,
    role: "client",
    user_id: authUser.id,
    client_id: profile.client_id,
    slug: portal.slug,
  });

  return response.json({
    ok: true,
    role: "client",
    slug: portal.slug,
    title: portal.portal_title,
  });
}

function publicAppUrl(request: Request) {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  const candidate = configured || (!isProduction ? `${request.protocol}://${request.get("host")}` : "");
  if (!candidate) throw new Error("PUBLIC_APP_URL is required for password recovery");
  const parsed = new URL(candidate);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || (isProduction && parsed.protocol !== "https:")) {
    throw new Error("PUBLIC_APP_URL must be a valid HTTPS origin");
  }
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.origin;
}

function validNewPassword(password: unknown) {
  return typeof password === "string"
    && password.length >= 12
    && password.length <= 128
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password);
}

async function requestPasswordRecovery(request: Request, response: Response) {
  if (!authRateLimit(request, response)) return;
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const mode = request.body?.mode === "client" ? "client" : "admin";
  if (!email || email.length > 320 || !email.includes("@")) {
    return response.status(400).json({ ok: false, error: "Enter a valid email address." });
  }
  if (!isSupabaseConfigured()) {
    return response.status(503).json({ ok: false, error: "Password recovery requires the configured Supabase Auth service." });
  }

  let redirectTo: string;
  try {
    redirectTo = `${publicAppUrl(request)}/auth/reset?mode=${mode}`;
  } catch {
    return response.status(503).json({ ok: false, error: "Password recovery is not configured for this deployment." });
  }
  try {
    const result = await createAnonClient().auth.resetPasswordForEmail(email, { redirectTo });
    if (result.error) console.error("Supabase password recovery request failed", result.error.message);
  } catch (error) {
    console.error("Password recovery request failed", error instanceof Error ? error.message : "Unknown recovery error");
  }

  // Deliberately identical for existing and unknown accounts.
  return response.status(202).json({
    ok: true,
    message: "If an account exists for that email, Supabase will send a password recovery link.",
  });
}

async function completePasswordRecovery(request: Request, response: Response) {
  if (!authRateLimit(request, response)) return;
  const accessToken = typeof request.body?.access_token === "string" ? request.body.access_token : "";
  const refreshToken = typeof request.body?.refresh_token === "string" ? request.body.refresh_token : "";
  const code = typeof request.body?.code === "string" ? request.body.code : "";
  const newPassword = request.body?.new_password;
  if (!validNewPassword(newPassword)) {
    return response.status(400).json({ ok: false, error: "Use 12–128 characters with uppercase, lowercase, and a number." });
  }
  if ((!accessToken || !refreshToken) && !code) {
    return response.status(400).json({ ok: false, error: "This recovery link is invalid or expired. Request a new link." });
  }
  if (!isSupabaseConfigured()) {
    return response.status(503).json({ ok: false, error: "Password recovery requires the configured Supabase Auth service." });
  }

  try {
    const auth = createAnonClient();
    const sessionResult = code
      ? await auth.auth.exchangeCodeForSession(code)
      : await auth.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (sessionResult.error || !sessionResult.data.session || !sessionResult.data.user) {
      return response.status(400).json({ ok: false, error: "This recovery link is invalid or expired. Request a new link." });
    }
    const update = await auth.auth.updateUser({ password: newPassword as string });
    if (update.error) {
      return response.status(400).json({ ok: false, error: "The password could not be updated. Request a new recovery link." });
    }

    const profile = await profileForUser(createServiceClient(), sessionResult.data.user.id);
    if (!profile) return response.status(403).json({ ok: false, error: "This account does not have a VectorOps profile." });
    const session: Session = {
      access_token: sessionResult.data.session.access_token,
      refresh_token: sessionResult.data.session.refresh_token,
      role: profile.role,
      user_id: profile.user_id,
      client_id: profile.client_id,
    };
    let destination = "/admin";
    if (profile.role === "client" && profile.client_id) {
      const [client, portal] = await Promise.all([
        createServiceClient().from("clients").select("status").eq("id", profile.client_id).single(),
        createServiceClient().from("client_portal_config").select("slug").eq("client_id", profile.client_id).single(),
      ]);
      if (client.error || portal.error || !portal.data || ["churned", "archived"].includes(client.data?.status)) {
        return response.status(403).json({ ok: false, error: "This client portal is currently inactive." });
      }
      session.slug = portal.data.slug;
      destination = `/portal/${portal.data.slug}`;
    }
    writeSession(response, session);
    return response.json({ ok: true, role: profile.role, destination });
  } catch {
    return response.status(400).json({ ok: false, error: "This recovery link is invalid or expired. Request a new link." });
  }
}

async function currentSession(request: Request, response: Response) {
  try {
    const verified = await verifySession(request, response);
    if (!verified) return response.status(401).json({ ok: false, error: "Not authenticated." });
    const { session, profile } = verified;
    return response.json({
      ok: true,
      user: {
        id: profile.user_id,
        role: profile.role,
        client_id: profile.client_id,
        slug: session.slug,
        name: profile.full_name || (profile.role === "admin" ? "VectorOps Admin" : "Client"),
      },
    });
  } catch {
    return response.status(401).json({ ok: false, error: "Not authenticated." });
  }
}

async function clientAccess(request: Request, response: Response) {
  const slug = String(request.params.slug || "").toLowerCase();
  if (!slug) return response.status(401).json({ ok: false, error: "You don't have access to this portal." });

  try {
    const verified = await verifySession(request, response);
    if (!verified) return response.status(401).json({ ok: false, error: "You don't have access to this portal." });
    const { session } = verified;

    // Admin cannot be treated as client
    if (session.role === "admin") {
      return response.status(403).json({ ok: false, error: "This account has an administrator role and cannot access the client portal." });
    }

    if (session.role !== "client" || !session.client_id) {
      return response.status(403).json({ ok: false, error: "Access denied. Client authentication required." });
    }

    // Client must only access their own client data
    if (!isSupabaseConfigured()) {
      const portal = Object.values(store.portalConfigs).find((p) => p.slug === slug);
      if (!portal) return response.status(404).json({ ok: false, error: "Portal not found." });
      if (portal.client_id !== session.client_id) {
        return response.status(403).json({ ok: false, error: "Access denied. You cannot access another client's portal." });
      }
      return response.json({ ok: true, slug: portal.slug, title: portal.portal_title });
    }

    const service = createServiceClient();
    const portal = await service.from("client_portal_config").select("client_id,slug,portal_title").eq("slug", slug).limit(1).maybeSingle();
    if (portal.error || !portal.data) return response.status(404).json({ ok: false, error: "Portal not found." });

    if (portal.data.client_id !== session.client_id) {
      return response.status(403).json({ ok: false, error: "Access denied. You cannot access another client's portal." });
    }

    return response.json({ ok: true, slug: portal.data.slug, title: portal.data.portal_title });
  } catch {
    return response.status(401).json({ ok: false, error: "You don't have access to this portal." });
  }
}

// --------------------------------------------------------------------------
// CLIENT PORTAL CONTROLLERS (TENANT ISOLATED)
// --------------------------------------------------------------------------

async function portalSummary(request: Request, response: Response) {
  const slug = String(request.params.slug || "").toLowerCase();
  if (!slug) return response.status(401).json({ ok: false, error: "You don't have access to this portal." });

  try {
    const verified = await verifySession(request, response);
    if (!verified) return response.status(401).json({ ok: false, error: "You don't have access to this portal." });
    const { session, userClient } = verified;

    // Admin cannot be treated as client
    if (session.role === "admin") {
      return response.status(403).json({ ok: false, error: "This account has an administrator role and cannot access the client portal." });
    }

    if (session.role !== "client" || !session.client_id) {
      return response.status(403).json({ ok: false, error: "Access denied. Client portal authentication required." });
    }

    if (isSupabaseConfigured() && userClient) {
      const service = createServiceClient();
      const [portalResult, clientResult, profileResult, subscriptionsResult, workflowsResult, workflowRunsResult, invoicesResult, paymentsResult, adjustmentsResult, tasksResult, ticketsResult, ticketMessagesResult, metricsResult, reportsResult] = await Promise.all([
        userClient.from("client_portal_config").select("*").eq("slug", slug).eq("client_id", session.client_id!).maybeSingle(),
        userClient.from("clients").select("*").eq("id", session.client_id!).maybeSingle(),
        userClient.from("profiles").select("user_id,full_name,phone,created_at,updated_at").eq("user_id", session.user_id!).maybeSingle(),
        userClient.from("subscriptions").select("*").eq("client_id", session.client_id!).order("created_at", { ascending: false }).limit(1),
        userClient.from("workflows").select("*").eq("client_id", session.client_id!).eq("client_visible", true).order("created_at", { ascending: false }),
        userClient.from("workflow_runs").select("id,workflow_id,source_execution_id,started_at,finished_at,status,duration_ms,error_message,created_at").eq("client_id", session.client_id!).eq("client_visible", true).order("started_at", { ascending: false }).limit(250),
        userClient.from("invoices").select("*").eq("client_id", session.client_id!).order("due_date", { ascending: false }),
        service.from("payments").select("id,client_id,invoice_id,amount,payment_date,method,reference,status,created_at").eq("client_id", session.client_id!).order("payment_date", { ascending: false }),
        service.from("billing_adjustments").select("id,client_id,subscription_id,invoice_id,adjustment_type,amount_delta,days_delta,description,applied,applied_at,created_at").eq("client_id", session.client_id!).eq("applied", true).order("created_at", { ascending: false }),
        userClient.from("tasks").select("*").eq("client_id", session.client_id!).eq("client_visible", true).order("due_at", { ascending: true }),
        userClient.from("support_tickets").select("*").eq("client_id", session.client_id!).order("created_at", { ascending: false }),
        userClient.from("support_ticket_messages").select("id,ticket_id,sender_user_id,message,created_at").eq("client_id", session.client_id!).eq("internal", false).order("created_at", { ascending: true }),
        userClient.from("business_events").select("*").eq("client_id", session.client_id!).order("occurred_at", { ascending: false }).limit(500),
        userClient.from("client_reports").select("id,report_type,period_start,period_end,title,summary,metrics,insights,generated_at").eq("client_id", session.client_id!).eq("visible_to_client", true).order("period_end", { ascending: false }).limit(50),
      ]);
      const failed = [portalResult, clientResult, profileResult, subscriptionsResult, workflowsResult, workflowRunsResult, invoicesResult, paymentsResult, adjustmentsResult, tasksResult, ticketsResult, ticketMessagesResult, metricsResult, reportsResult].find((item) => item.error);
      if (failed?.error) throw failed.error;
      if (!portalResult.data || !clientResult.data) return response.status(404).json({ ok: false, error: "Portal not found." });
      return response.json({
        ok: true,
        portal: portalResult.data,
        client: clientResult.data,
        profile: profileResult.data,
        subscription: subscriptionsResult.data?.[0] || null,
        workflows: workflowsResult.data || [],
        workflowRuns: workflowRunsResult.data || [],
        invoices: invoicesResult.data || [],
        payments: paymentsResult.data || [],
        adjustments: adjustmentsResult.data || [],
        tasks: tasksResult.data || [],
        tickets: (ticketsResult.data || []).map((ticket: any) => ({
          ...ticket,
          description: (ticketMessagesResult.data || []).find((message: any) => message.ticket_id === ticket.id)?.message || "No message supplied.",
          messages: (ticketMessagesResult.data || []).filter((message: any) => message.ticket_id === ticket.id),
        })),
        metrics: metricsResult.data || [],
        reports: reportsResult.data || [],
      });
    }

    // Development-only local store.
    const portal = Object.values(store.portalConfigs).find((p) => p.slug === slug);
    if (!portal) return response.status(404).json({ ok: false, error: "Portal not found." });

    // Strict Tenant Isolation: Client must only access their own client data
    if (portal.client_id !== session.client_id) {
      return response.status(403).json({ ok: false, error: "Access denied. You cannot access another client's data." });
    }

    const client = store.clients.find((c) => c.id === portal.client_id);
    const subscription = store.subscriptions.find((s) => s.client_id === portal.client_id) || null;
    const workflows = store.workflows.filter((w) => w.client_id === portal.client_id && w.client_visible);
    const invoices = store.invoices.filter((i) => i.client_id === portal.client_id);
    const tasks = store.tasks.filter((t) => t.client_id === portal.client_id);

    // Filter tickets: NEVER expose internal_notes to the client
    const tickets = store.supportTickets
      .filter((t) => t.client_id === portal.client_id)
      .map(({ internal_notes, ...safeTicket }) => ({
        ...safeTicket,
        messages: (safeTicket.messages?.length ? safeTicket.messages : [{ id: `${safeTicket.id}-initial`, ticket_id: safeTicket.id, sender_user_id: session.user_id, message: safeTicket.description, internal: false, created_at: safeTicket.created_at }])
          .filter((message) => !message.internal)
          .map(({ internal: _internal, ...message }) => message),
      }));

    const metrics = store.businessEvents.filter((b) => b.client_id === portal.client_id);

    return response.json({
      ok: true,
      portal,
      client,
      profile: store.profiles.find((profile) => profile.user_id === session.user_id) || null,
      subscription,
      workflows,
      workflowRuns: [],
      invoices,
      payments: store.payments.filter((payment) => payment.client_id === portal.client_id).map(({ notes: _notes, recorded_by_user_id: _recordedBy, ...payment }) => payment),
      adjustments: store.billingAdjustments.filter((adjustment) => adjustment.client_id === portal.client_id && adjustment.applied),
      tasks,
      tickets,
      metrics,
      reports: [],
    });
  } catch {
    return response.status(503).json({ ok: false, error: "We couldn't load your portal right now. Please try again." });
  }
}

async function updateClientAutomationState(request: Request, response: Response) {
  const slug = String(request.params.slug || "").toLowerCase();
  const workflowId = String(request.params.workflowId || "");

  if (!slug || !workflowId) return response.status(401).json({ ok: false, error: "Not authenticated." });

  try {
    const verified = await verifySession(request, response);
    if (!verified) return response.status(401).json({ ok: false, error: "Not authenticated." });
    const { session, userClient } = verified;

    if (session.role === "admin") {
      return response.status(403).json({ ok: false, error: "Administrator cannot modify workflows through client endpoints." });
    }
    if (session.role !== "client" || !session.client_id) {
      return response.status(403).json({ ok: false, error: "Access denied." });
    }

    const { desired_state } = request.body as { desired_state?: string };
    if (desired_state !== "running" && desired_state !== "paused") {
      return response.status(400).json({ ok: false, error: "Desired state must be running or paused." });
    }

    if (isSupabaseConfigured() && userClient) {
      if (session.slug !== slug) {
        return response.status(403).json({ ok: false, error: "Access denied. You cannot modify another client's automation." });
      }
      const result = await userClient.rpc("request_automation_control", {
        p_workflow_id: workflowId,
        p_desired_state: desired_state,
        p_reason: "Client portal request",
      });
      if (result.error) throw result.error;
      return response.json({ ok: true, control: result.data, message: "Control request queued for secure automation synchronization." });
    }

    const portal = Object.values(store.portalConfigs).find((p) => p.slug === slug);
    if (!portal) return response.status(404).json({ ok: false, error: "Portal not found." });
    if (session.client_id !== portal.client_id) {
      return response.status(403).json({ ok: false, error: "Access denied. You cannot modify another client's automation." });
    }
    const wf = store.workflows.find((w) => w.id === workflowId);
    if (!wf || wf.client_id !== session.client_id) {
      return response.status(403).json({ ok: false, error: "Access denied. Workflow does not belong to this client." });
    }

    return response.status(503).json({ ok: false, error: "Live automation control is unavailable without configured Supabase and n8n services." });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Unable to update state." });
  }
}

async function submitClientTicket(request: Request, response: Response) {
  const slug = String(request.params.slug || "").toLowerCase();
  if (!slug) return response.status(401).json({ ok: false, error: "Not authenticated." });

  try {
    const verified = await verifySession(request, response);
    if (!verified) return response.status(401).json({ ok: false, error: "Not authenticated." });
    const { session, userClient } = verified;
    if (session.role !== "client" || !session.client_id) {
      return response.status(403).json({ ok: false, error: "Access denied." });
    }

    const { subject, description, category, priority } = request.body as {
      subject?: string;
      description?: string;
      category?: string;
      priority?: "low" | "normal" | "medium" | "high" | "urgent";
    };

    if (!subject?.trim() || !description?.trim()) {
      return response.status(400).json({ ok: false, error: "Subject and description are required." });
    }
    if (subject.trim().length > 200 || description.trim().length > 5000 || (category && category.trim().length > 100)) {
      return response.status(400).json({ ok: false, error: "Ticket subject, category, or message is too long." });
    }

    if (!(["low", "normal", "high", "urgent"] as const).includes((priority === "medium" ? "normal" : priority || "normal") as any)) {
      return response.status(400).json({ ok: false, error: "Invalid ticket priority." });
    }

    if (isSupabaseConfigured() && userClient) {
      if (session.slug !== slug) {
        return response.status(403).json({ ok: false, error: "Access denied. You cannot submit tickets for another client." });
      }
      const normalizedPriority = priority === "medium" ? "normal" : priority || "normal";
      const ticketResult = await userClient.rpc("create_client_ticket", {
        p_subject: subject.trim(),
        p_message: description.trim(),
        p_category: category?.trim() || "general",
        p_priority: normalizedPriority,
      });
      if (ticketResult.error) throw ticketResult.error;
      return response.status(201).json({ ok: true, ticket: { ...ticketResult.data, description: description.trim() } });
    }

    const portal = Object.values(store.portalConfigs).find((p) => p.slug === slug);
    if (!portal) return response.status(404).json({ ok: false, error: "Portal not found." });
    if (portal.client_id !== session.client_id) {
      return response.status(403).json({ ok: false, error: "Access denied. You cannot submit tickets for another client." });
    }

    const normalizedPriority = priority === "medium" ? "normal" : priority || "normal";
    const ticketNumber = `TIK-${1000 + store.supportTickets.length + 1}`;
    const localTicketId = `tkt-${Date.now()}`;
    const newTicket = {
      id: localTicketId,
      client_id: session.client_id, // Trust ONLY session.client_id
      ticket_number: ticketNumber,
      subject: subject.trim(),
      description: description.trim(),
      status: "open" as const,
      priority: normalizedPriority === "normal" ? ("medium" as const) : normalizedPriority,
      category: category || "General Support",
      internal_notes: null,
      messages: [{ id: `msg-${Date.now()}`, ticket_id: localTicketId, sender_user_id: session.user_id || null, message: description.trim(), internal: false, created_at: new Date().toISOString() }],
      created_at: new Date().toISOString(),
    };

    store.supportTickets.unshift(newTicket);

    return response.status(201).json({ ok: true, ticket: { ...newTicket, priority: normalizedPriority } });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Unable to submit ticket." });
  }
}

async function replyToClientTicket(request: Request, response: Response) {
  const slug = String(request.params.slug || "").toLowerCase();
  const ticketId = String(request.params.ticketId || "");
  const message = typeof request.body?.message === "string" ? request.body.message.trim() : "";
  if (!message || message.length > 5000) return response.status(400).json({ ok: false, error: "Enter a reply of 1–5000 characters." });

  try {
    const verified = await verifySession(request, response);
    if (!verified) return response.status(401).json({ ok: false, error: "Not authenticated." });
    const { session, userClient } = verified;
    if (session.role !== "client" || !session.client_id || session.slug !== slug) {
      return response.status(403).json({ ok: false, error: "Access denied." });
    }
    if (isSupabaseConfigured() && userClient) {
      const result = await userClient.rpc("add_client_ticket_message", { p_ticket_id: ticketId, p_message: message });
      if (result.error) throw result.error;
      return response.status(201).json({ ok: true, message: result.data });
    }
    const ticket = store.supportTickets.find((item) => item.id === ticketId && item.client_id === session.client_id);
    if (!ticket) return response.status(404).json({ ok: false, error: "Ticket not found." });
    if (ticket.status === "closed") return response.status(400).json({ ok: false, error: "Closed tickets cannot receive replies." });
    const reply = { id: `msg-${Date.now()}`, ticket_id: ticket.id, sender_user_id: session.user_id || null, message, internal: false, created_at: new Date().toISOString() };
    ticket.messages = [...(ticket.messages || []), reply];
    ticket.status = "in_progress";
    return response.status(201).json({ ok: true, message: reply });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Unable to add reply." });
  }
}

async function updateClientProfile(request: Request, response: Response) {
  const slug = String(request.params.slug || "").toLowerCase();
  const fullName = typeof request.body?.full_name === "string" ? request.body.full_name.trim() : "";
  const phone = typeof request.body?.phone === "string" ? request.body.phone.trim() : "";
  if (!fullName || fullName.length > 120 || phone.length > 40) {
    return response.status(400).json({ ok: false, error: "Enter a valid name and phone number." });
  }
  try {
    const verified = await verifySession(request, response);
    if (!verified) return response.status(401).json({ ok: false, error: "Not authenticated." });
    const { session, userClient } = verified;
    if (session.role !== "client" || !session.user_id || session.slug !== slug) {
      return response.status(403).json({ ok: false, error: "Access denied." });
    }
    if (isSupabaseConfigured() && userClient) {
      const result = await userClient.from("profiles").update({ full_name: fullName, phone: phone || null }).eq("user_id", session.user_id).select("user_id,full_name,phone,created_at,updated_at").single();
      if (result.error) throw result.error;
      return response.json({ ok: true, profile: result.data });
    }
    const profile = store.profiles.find((item) => item.user_id === session.user_id);
    if (!profile) return response.status(404).json({ ok: false, error: "Profile not found." });
    profile.full_name = fullName;
    profile.phone = phone || null;
    return response.json({ ok: true, profile });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Unable to update profile." });
  }
}

// --------------------------------------------------------------------------
// ADMIN CONTEXT & CONTROLLERS
// --------------------------------------------------------------------------

async function adminContext(request: Request, response: Response) {
  const verified = await verifySession(request, response);
  if (!verified || verified.profile.role !== "admin") return null;
  return {
    isLocal: !isSupabaseConfigured(),
    userId: verified.profile.user_id,
    service: isSupabaseConfigured() ? createServiceClient() : undefined,
    actor: isSupabaseConfigured() ? verified.userClient! : undefined,
  };
}

async function adminOverview(request: Request, response: Response) {
  const context = await adminContext(request, response);
  if (!context) return response.status(401).json({ ok: false, error: "Not authenticated as administrator." });

  if (context.service) {
    const [clientsResult, subscriptionsResult, invoicesResult, paymentsResult, ticketsResult, workflowsResult, templatesResult, instancesResult] = await Promise.all([
      context.service.from("clients").select("*").order("created_at", { ascending: false }),
      context.service.from("subscriptions").select("client_id,monthly_amount,currency,status,billing_day,auto_renew,current_period_end"),
      context.service.from("invoices").select("id,client_id,invoice_number,total_amount,amount_paid,status,due_date"),
      context.service.from("payments").select("client_id,amount,status"),
      context.service.from("support_tickets").select("id,client_id,ticket_number,subject,priority,status"),
      context.service.from("workflows").select("id,client_id,business_name,status,desired_state,actual_state,last_error"),
      context.service.from("automation_templates").select("id", { count: "exact", head: true }),
      context.service.from("n8n_instances").select("id,status,last_sync_status,last_sync_error"),
    ]);
    const failed = [clientsResult, subscriptionsResult, invoicesResult, paymentsResult, ticketsResult, workflowsResult, templatesResult, instancesResult].find((item) => item.error);
    if (failed?.error) return response.status(503).json({ ok: false, error: "Unable to load agency overview." });

    const clients = (clientsResult.data || []) as any[];
    const subscriptions = (subscriptionsResult.data || []) as any[];
    const invoices = (invoicesResult.data || []) as any[];
    const payments = (paymentsResult.data || []) as any[];
    const tickets = (ticketsResult.data || []) as any[];
    const workflows = (workflowsResult.data || []) as any[];
    const instances = (instancesResult.data || []) as any[];
    const clientNames = new Map(clients.map((client) => [client.id, client.company_name]));
    const currencyByClient = new Map(subscriptions.map((subscription) => [subscription.client_id, subscription.currency || "USD"]));
    const financialByCurrency: Record<string, { mrr: number; outstanding: number; collected: number }> = {};
    const financialBucket = (clientId: string) => {
      const currency = currencyByClient.get(clientId) || "USD";
      return (financialByCurrency[currency] ||= { mrr: 0, outstanding: 0, collected: 0 });
    };
    subscriptions.filter((subscription) => subscription.status === "active").forEach((subscription) => {
      financialBucket(subscription.client_id).mrr += Number(subscription.monthly_amount || 0);
    });
    invoices.filter((invoice) => !["paid", "void"].includes(invoice.status)).forEach((invoice) => {
      financialBucket(invoice.client_id).outstanding += Math.max(0, Number(invoice.total_amount) - Number(invoice.amount_paid));
    });
    payments.filter((payment) => payment.status === "received").forEach((payment) => {
      financialBucket(payment.client_id).collected += Number(payment.amount || 0);
    });
    const outstanding = invoices.filter((invoice) => !["paid", "void"].includes(invoice.status)).reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total_amount) - Number(invoice.amount_paid)), 0);
    const attentionItems = [
      ...invoices.filter((invoice) => ["partially_paid", "overdue"].includes(invoice.status)).map((invoice) => ({
        id: `invoice-${invoice.id}`,
        tone: "amber",
        title: `${invoice.status === "overdue" ? "Overdue" : "Partial"} balance · ${clientNames.get(invoice.client_id) || "Client"}`,
        subtitle: `${invoice.invoice_number} has ${Math.max(0, Number(invoice.total_amount) - Number(invoice.amount_paid)).toFixed(2)} outstanding.`,
        actionLabel: "Review billing",
        targetModule: "Money",
      })),
      ...tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).map((ticket) => ({
        id: `ticket-${ticket.id}`,
        tone: ticket.priority === "urgent" || ticket.priority === "high" ? "amber" : "purple",
        title: `Support waiting · ${ticket.ticket_number}`,
        subtitle: `${clientNames.get(ticket.client_id) || "Client"}: ${ticket.subject}`,
        actionLabel: "Open ticket",
        targetModule: "Support",
      })),
      ...workflows.filter((workflow) => workflow.status === "error" || workflow.actual_state === "unknown").map((workflow) => ({
        id: `workflow-${workflow.id}`,
        tone: "amber",
        title: `Automation needs attention · ${workflow.business_name || "Workflow"}`,
        subtitle: workflow.last_error || "Execution state is not synchronized.",
        actionLabel: "Review automation",
        targetModule: "Automations",
      })),
    ].slice(0, 12);

    return response.json({
      ok: true,
      clients,
      templates: templatesResult.count || 0,
      workflows: workflows.filter((workflow) => workflow.status === "active").length,
      instances: instances.filter((instance) => instance.status === "active").length,
      mrr: subscriptions.filter((subscription) => subscription.status === "active").reduce((sum, subscription) => sum + Number(subscription.monthly_amount), 0),
      overdue: outstanding,
      collected: payments.filter((payment) => payment.status === "received").reduce((sum, payment) => sum + Number(payment.amount), 0),
      financialByCurrency,
      healthPercent: workflows.length === 0
        ? 100
        : Math.round((workflows.filter((workflow) => workflow.status !== "error" && workflow.actual_state !== "unknown" && workflow.desired_state === workflow.actual_state).length / workflows.length) * 1000) / 10,
      openTickets: tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length,
      attentionItems,
    });
  }

  const data = store.getOverviewData();
  const localCurrencyByClient = new Map(store.subscriptions.map((subscription) => [subscription.client_id, subscription.currency || "USD"]));
  const localFinancialByCurrency: Record<string, { mrr: number; outstanding: number; collected: number }> = {};
  const localFinancialBucket = (clientId: string) => {
    const currency = localCurrencyByClient.get(clientId) || "USD";
    return (localFinancialByCurrency[currency] ||= { mrr: 0, outstanding: 0, collected: 0 });
  };
  store.subscriptions.filter((subscription) => subscription.status === "active").forEach((subscription) => {
    localFinancialBucket(subscription.client_id).mrr += Number(subscription.monthly_amount || 0);
  });
  store.invoices.filter((invoice) => !["paid", "void"].includes(invoice.status)).forEach((invoice) => {
    localFinancialBucket(invoice.client_id).outstanding += Math.max(0, Number(invoice.total_amount) - Number(invoice.amount_paid));
  });
  store.payments.filter((payment) => ["received", "recorded", "reconciled"].includes(payment.status)).forEach((payment) => {
    localFinancialBucket(payment.client_id).collected += Number(payment.amount || 0);
  });
  return response.json({
    ok: true,
    clients: data.clients,
    templates: store.automationTemplates.length,
    workflows: store.workflows.filter((workflow) => workflow.status === "active").length,
    instances: store.n8nInstances.filter((instance) => instance.status === "active").length,
    mrr: data.kpis.mrr,
    overdue: data.kpis.outstandingRevenue,
    collected: data.kpis.collectedRevenue,
    financialByCurrency: localFinancialByCurrency,
    healthPercent: store.workflows.length === 0
      ? 100
      : Math.round((store.workflows.filter((workflow) => workflow.status !== "error" && workflow.actual_state !== "error" && workflow.desired_state === workflow.actual_state).length / store.workflows.length) * 1000) / 10,
    openTickets: data.kpis.openTickets,
    attentionItems: store.getAttentionItems().map((item) => ({
      id: item.id,
      tone: item.severity === "low" ? "green" : item.severity === "medium" ? "purple" : "amber",
      title: item.what,
      subtitle: item.why,
      actionLabel: item.action_label,
      targetModule: item.module,
    })),
  });
}

async function adminData(request: Request, response: Response) {
  const context = await adminContext(request, response);
  if (!context) return response.status(401).json({ ok: false, error: "Not authenticated as administrator." });

  const resource = String(request.params.resource || "");

  if (context.service) {
    const allowedResources = new Set([
      "clients", "client_portal_config", "subscriptions", "invoices", "payments", "billing_adjustments", "workflows",
      "discovered_workflows", "automation_templates", "n8n_instances", "provider_balances", "credentials", "tasks",
      "support_tickets", "calendar_events", "business_events", "audit_logs",
      "workflow_runs", "automation_logs", "client_onboarding", "client_reports",
    ]);
    if (!allowedResources.has(resource)) return response.status(404).json({ ok: false, error: `Unknown resource: ${resource}` });

    if (resource === "support_tickets") {
      const [tickets, messages] = await Promise.all([
        context.service.from("support_tickets").select("*").order("updated_at", { ascending: false }),
        context.service.from("support_ticket_messages").select("id,ticket_id,sender_user_id,message,internal,created_at").order("created_at", { ascending: true }),
      ]);
      if (tickets.error || messages.error) return response.status(503).json({ ok: false, error: "Unable to load support tickets." });
      const rows = (tickets.data || []).map((ticket: any) => {
        const related = (messages.data || []).filter((message: any) => message.ticket_id === ticket.id);
        return {
          ...ticket,
          description: related.find((message: any) => !message.internal)?.message || "No client message supplied.",
          internal_notes: related.filter((message: any) => message.internal).map((message: any) => message.message).join("\n\n"),
          messages: related.filter((message: any) => !message.internal).map(({ internal: _internal, ...message }: any) => message),
        };
      });
      return response.json({ ok: true, rows });
    }

    if (resource === "workflows") {
      const [workflows, controls] = await Promise.all([
        context.service.from("workflows").select("*").order("updated_at", { ascending: false }),
        context.service.from("client_automation_controls").select("workflow_id,sync_status"),
      ]);
      if (workflows.error || controls.error) return response.status(503).json({ ok: false, error: "Unable to load workflows." });
      const controlByWorkflow = new Map((controls.data || []).map((control: any) => [control.workflow_id, control.sync_status]));
      return response.json({ ok: true, rows: (workflows.data || []).map((workflow: any) => ({ ...workflow, sync_status: controlByWorkflow.get(workflow.id) || (workflow.desired_state === workflow.actual_state ? "success" : "pending") })) });
    }

    const result = await context.service.from(resource).select("*").order("created_at", { ascending: false });
    if (result.error) return response.status(503).json({ ok: false, error: `Unable to load ${resource.replaceAll("_", " ")}.` });
    let rows = (result.data || []) as any[];
    if (resource === "discovered_workflows") rows = rows.map((row) => ({ ...row, name_in_n8n: row.discovered_name || row.n8n_workflow_id, discovered_at: row.first_seen_at }));
    if (resource === "automation_templates") rows = rows.map((row) => ({ ...row, version: "1.0", target_industry: row.default_config?.target_industry || "All industries", n8n_template_json_ref: row.n8n_template_ref }));
    if (resource === "subscriptions") rows = rows.map((row) => ({ ...row, next_billing_date: row.current_period_end ? new Date(`${row.current_period_end}T00:00:00Z`).toISOString().slice(0, 10) : null }));
    if (resource === "provider_balances") rows = rows.map((row) => ({ ...row, provider: row.provider_name, category: row.account_name || "Provider account", current_balance: row.balance, alert_threshold: row.threshold, last_checked_at: row.checked_at, status: row.balance <= row.threshold ? "low_balance" : "healthy" }));
    if (resource === "credentials") rows = rows.map((row) => ({ ...row, service_name: row.credential_name, status: row.active ? (row.expires_at && new Date(row.expires_at).getTime() < Date.now() ? "expired" : "active") : "expired", last_used_at: row.updated_at }));
    return response.json({ ok: true, rows });
  }

  switch (resource) {
    case "clients":
      return response.json({ ok: true, rows: store.clients });
    case "subscriptions":
      return response.json({ ok: true, rows: store.subscriptions.map((row) => ({ ...row, status: row.status === "past_due" ? "expired" : row.status, next_billing_date: row.current_period_end })) });
    case "invoices":
      return response.json({ ok: true, rows: store.invoices.map((row) => ({ ...row, invoice_type: row.invoice_type === "recurring" ? "renewal" : row.invoice_type, status: row.status === "open" ? "due" : row.status })) });
    case "payments":
      return response.json({ ok: true, rows: store.payments.map((row) => ({ ...row, status: row.status === "reconciled" || row.status === "recorded" ? "received" : row.status })) });
    case "billing_adjustments":
      return response.json({ ok: true, rows: store.billingAdjustments });
    case "workflows":
      return response.json({ ok: true, rows: store.workflows.map((row) => ({ ...row, status: row.status === "inactive" ? "disabled" : row.status, actual_state: row.actual_state === "error" ? "unknown" : row.actual_state, sync_status: row.sync_status === "synchronized" ? "success" : row.sync_status === "synchronizing" ? "syncing" : row.sync_status })) });
    case "discovered_workflows":
      return response.json({ ok: true, rows: store.discoveredWorkflows.map((row) => ({ ...row, discovered_name: row.workflow_name, name_in_n8n: row.workflow_name, first_seen_at: row.discovered_at })) });
    case "automation_templates":
      return response.json({ ok: true, rows: store.automationTemplates.map((row) => ({ ...row, version: "1.0", target_industry: "All industries", n8n_template_ref: null, default_config: {} })) });
    case "n8n_instances":
      return response.json({ ok: true, rows: store.n8nInstances });
    case "provider_balances":
      return response.json({ ok: true, rows: store.providerBalances });
    case "credentials":
      return response.json({ ok: true, rows: store.credentials });
    case "tasks":
      return response.json({ ok: true, rows: store.tasks.map((row) => ({ ...row, status: row.status === "done" ? "completed" : row.status })) });
    case "support_tickets":
      return response.json({ ok: true, rows: store.supportTickets.map((row) => ({ ...row, status: row.status === "in_progress" ? "pending_admin" : row.status === "waiting_client" ? "pending_client" : row.status, priority: row.priority === "medium" ? "normal" : row.priority, messages: (row.messages || []).filter((message) => !message.internal).map(({ internal: _internal, ...message }) => message) })) });
    case "calendar_events":
      return response.json({ ok: true, rows: store.calendarEvents.map((row) => ({ ...row, description: row.notes, event_type: ["invoice_due", "payment", "adjustment", "task", "support_followup"].includes(row.event_type) ? "internal" : row.event_type })) });
    case "business_events":
      return response.json({ ok: true, rows: store.businessEvents });
    case "audit_logs":
      return response.json({ ok: true, rows: store.auditLogs });
    case "client_portal_config":
      return response.json({ ok: true, rows: Object.values(store.portalConfigs) });
    default:
      return response.status(404).json({ ok: false, error: `Unknown resource: ${resource}` });
  }
}

async function adminWrite(request: Request, response: Response) {
  const context = await adminContext(request, response);
  if (!context) return response.status(401).json({ ok: false, error: "Not authenticated." });

  const resource = String(request.params.resource || "");
  const body = request.body as Record<string, unknown>;

  const taskStatuses = ["todo", "in_progress", "blocked", "completed", "cancelled"];
  const taskPriorities = ["low", "medium", "high", "urgent"];
  const ticketStatuses = ["open", "pending_client", "pending_admin", "resolved", "closed"];
  const ticketPriorities = ["low", "normal", "high", "urgent"];
  const adjustmentTypes = ["free_days", "discount", "credit", "goodwill_extension", "pause", "renewal_date_change"];
  const eventTypes = ["meeting", "call", "onboarding", "renewal", "internal", "other"];
  const eventTypeAliases: Record<string, string> = { invoice_due: "internal", payment: "internal", adjustment: "internal", task: "internal", support_followup: "call", maintenance: "internal" };

  if (resource === "payments" && (!body.invoice_id || !Number.isFinite(Number(body.amount)) || Number(body.amount) <= 0)) {
    return response.status(400).json({ ok: false, error: "A valid invoice and positive payment amount are required." });
  }
  if (resource === "billing_adjustments" && (!body.client_id || !adjustmentTypes.includes(String(body.adjustment_type)) || (!body.subscription_id && !body.invoice_id) || !Number.isFinite(Number(body.amount_delta || 0)) || !Number.isFinite(Number(body.days_delta || 0)))) {
    return response.status(400).json({ ok: false, error: "A client, billing target, valid adjustment type, and numeric adjustment are required." });
  }
  if (resource === "tasks" && (!String(body.title || "").trim() || !taskStatuses.includes(String(body.status || "todo")) || !taskPriorities.includes(String(body.priority || "medium")) || (body.due_at && Number.isNaN(Date.parse(String(body.due_at)))))) {
    return response.status(400).json({ ok: false, error: "A task title, valid status, priority, and due date are required." });
  }
  if (resource === "support_tickets" && (!body.client_id || !String(body.subject || "").trim() || !ticketStatuses.includes(String(body.status || "open")) || !ticketPriorities.includes(String(body.priority || "normal")))) {
    return response.status(400).json({ ok: false, error: "A client, subject, valid status, and priority are required." });
  }
  if (resource === "calendar_events") {
    const normalizedEventType = eventTypeAliases[String(body.event_type)] || String(body.event_type || "other");
    const startsAt = String(body.starts_at || "");
    const endsAt = body.ends_at ? String(body.ends_at) : null;
    if (!String(body.title || "").trim() || !eventTypes.includes(normalizedEventType) || !startsAt || Number.isNaN(Date.parse(startsAt)) || (endsAt && (Number.isNaN(Date.parse(endsAt)) || Date.parse(endsAt) < Date.parse(startsAt)))) {
      return response.status(400).json({ ok: false, error: "Event title, type, and a valid chronological time range are required." });
    }
  }

  try {
    if (context.service) {
      if (resource === "payments") {
        const amount = Number(body.amount);
        const payment = await context.actor!.rpc("mark_payment_received", {
          p_invoice_id: String(body.invoice_id),
          p_amount: amount,
          p_method: body.method ? String(body.method) : null,
          p_reference: body.reference ? String(body.reference) : null,
          p_notes: body.notes ? String(body.notes) : null,
        });
        if (payment.error) throw payment.error;
        const invoice = await context.service.from("invoices").select("*").eq("id", String(body.invoice_id)).single();
        if (invoice.error) throw invoice.error;
        return response.status(201).json({ ok: true, row: payment.data, invoice: invoice.data });
      }

      if (resource === "billing_adjustments") {
        const adjustmentType = String(body.adjustment_type || "");
        const adjustment = await context.actor!.rpc("apply_billing_adjustment", {
          p_client_id: String(body.client_id),
          p_adjustment_type: adjustmentType,
          p_amount_delta: Number(body.amount_delta || 0),
          p_days_delta: Number(body.days_delta || 0),
          p_subscription_id: body.subscription_id ? String(body.subscription_id) : null,
          p_invoice_id: body.invoice_id ? String(body.invoice_id) : null,
          p_description: body.description ? String(body.description) : null,
        });
        if (adjustment.error) throw adjustment.error;
        return response.status(201).json({ ok: true, row: adjustment.data });
      }

      if (resource === "tasks") {
        if (!String(body.title || "").trim()) throw new Error("Task title is required.");
        const result = await context.service.from("tasks").insert({
          client_id: body.client_id ? String(body.client_id) : null,
          title: String(body.title).trim(),
          description: body.description ? String(body.description).trim() : null,
          status: body.status || "todo",
          priority: body.priority || "medium",
          due_at: body.due_at ? String(body.due_at) : null,
          created_by_user_id: context.userId,
        }).select("*").single();
        if (result.error) throw result.error;
        return response.status(201).json({ ok: true, row: result.data });
      }

      if (resource === "calendar_events") {
        const startsAt = String(body.starts_at || "");
        const result = await context.service.from("calendar_events").insert({
          client_id: body.client_id ? String(body.client_id) : null,
          title: String(body.title).trim(),
          description: body.notes ? String(body.notes).trim() : null,
          event_type: eventTypeAliases[String(body.event_type)] || String(body.event_type || "other"),
          starts_at: startsAt,
          ends_at: body.ends_at ? String(body.ends_at) : null,
          location: body.location ? String(body.location) : null,
          created_by_user_id: context.userId,
        }).select("*").single();
        if (result.error) throw result.error;
        return response.status(201).json({ ok: true, row: { ...result.data, notes: result.data.description } });
      }

      return response.status(400).json({ ok: false, error: `Writing to ${resource} is not supported by this endpoint.` });
    }

    if (resource === "payments") {
      // Partial Payments Engine (Section 51)
      const result = store.recordPayment({
        client_id: String(body.client_id || ""),
        invoice_id: String(body.invoice_id || ""),
        amount: Number(body.amount),
        method: String(body.method || "Direct"),
        reference: body.reference ? String(body.reference) : undefined,
        notes: body.notes ? String(body.notes) : undefined,
        recorded_by_user_id: context.userId,
      });
      return response.status(201).json({ ok: true, row: result.payment, invoice: result.invoice });
    }

    if (resource === "billing_adjustments") {
      // Billing Adjustments Engine (Section 53)
      const adj = store.recordBillingAdjustment({
        client_id: String(body.client_id || ""),
        subscription_id: body.subscription_id ? String(body.subscription_id) : undefined,
        invoice_id: body.invoice_id ? String(body.invoice_id) : undefined,
        adjustment_type: (body.adjustment_type as any) || "free_days",
        amount_delta: Number(body.amount_delta || 0),
        days_delta: Number(body.days_delta || 0),
        description: String(body.description || ""),
        applied: body.applied !== false,
        created_by_user_id: context.userId,
      });
      return response.status(201).json({ ok: true, row: adj });
    }

    if (resource === "tasks") {
      const task = {
        id: `tsk-${Date.now()}`,
        client_id: body.client_id ? String(body.client_id) : null,
        title: String(body.title || "Untitled Task"),
        description: body.description ? String(body.description) : null,
        status: (body.status as any) || "todo",
        priority: (body.priority as any) || "normal",
        due_at: body.due_at ? String(body.due_at) : null,
        completed_at: null,
        created_at: new Date().toISOString(),
      };
      store.tasks.unshift(task);
      return response.status(201).json({ ok: true, row: task });
    }

    if (resource === "support_tickets") {
      const ticket = {
        id: `tkt-${Date.now()}`,
        client_id: String(body.client_id || ""),
        ticket_number: `TIK-${1000 + store.supportTickets.length + 1}`,
        subject: String(body.subject || "Support Ticket"),
        description: String(body.description || ""),
        status: (body.status as any) || "open",
        priority: (body.priority as any) || "medium",
        category: String(body.category || "General"),
        internal_notes: body.internal_notes ? String(body.internal_notes) : null,
        created_at: new Date().toISOString(),
      };
      store.supportTickets.unshift(ticket);
      return response.status(201).json({ ok: true, row: ticket });
    }

    if (resource === "calendar_events") {
      const event = {
        id: `cal-${Date.now()}`,
        client_id: body.client_id ? String(body.client_id) : null,
        title: String(body.title || "Event"),
        event_type: (body.event_type as any) || "meeting",
        starts_at: String(body.starts_at || new Date().toISOString()),
        ends_at: String(body.ends_at || new Date().toISOString()),
        location: body.location ? String(body.location) : null,
        notes: body.notes ? String(body.notes) : null,
        created_at: new Date().toISOString(),
      };
      store.calendarEvents.unshift(event);
      return response.status(201).json({ ok: true, row: event });
    }

    if (resource === "n8n_instances") {
      const instance = {
        id: `inst-${Date.now()}`,
        instance_name: String(body.instance_name || "n8n Instance"),
        base_url: String(body.base_url || "https://n8n.example.com"),
        hosting_type: (body.hosting_type as any) || "shared",
        status: (body.status as any) || "active",
        server_id: body.server_id ? String(body.server_id) : null,
        n8n_api_secret_ref: String(body.n8n_api_secret_ref || `vault:secret:n8n-${Date.now()}`),
        last_verified_at: new Date().toISOString(),
        last_sync_status: "success" as const,
        connected_clients: 0,
        workflow_count: 0,
        created_at: new Date().toISOString(),
      };
      store.n8nInstances.unshift(instance);
      return response.status(201).json({ ok: true, row: instance });
    }

    if (resource === "workflows") {
      const wf = {
        id: `wf-${Date.now()}`,
        client_id: String(body.client_id || ""),
        n8n_instance_id: String(body.n8n_instance_id || "inst-shared-01"),
        n8n_workflow_id: String(body.n8n_workflow_id || `n8n-wf-${Math.floor(1000 + Math.random() * 9000)}`),
        workflow_name: String(body.workflow_name || "New Automation"),
        business_name: String(body.business_name || body.workflow_name || "New Automation"),
        business_job: String(body.business_job || "Automated Business Function"),
        description: body.description ? String(body.description) : null,
        status: "active" as const,
        client_visible: body.client_visible !== false,
        desired_state: (body.desired_state as any) || "running",
        actual_state: (body.actual_state as any) || "running",
        sync_status: "synchronized" as const,
        last_execution_at: new Date().toISOString(),
        last_success_at: new Date().toISOString(),
        last_failure_at: null,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.workflows.unshift(wf);
      return response.status(201).json({ ok: true, row: wf });
    }

    return response.status(400).json({ ok: false, error: `Writing to ${resource} is not supported.` });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Creation failed." });
  }
}

async function updateClientStatus(request: Request, response: Response) {
  const context = await adminContext(request, response);
  if (!context) return response.status(401).json({ ok: false, error: "Not authenticated." });

  const clientId = String(request.params.id || "");
  const { status } = request.body as { status?: string };

  try {
    if (context.service) {
      if (status === "churned") {
        const result = await context.actor!.rpc("churn_client", { p_client_id: clientId });
        if (result.error) throw result.error;
        return response.json({ ok: true, client: result.data });
      }
      if (status === "active") {
        const result = await context.actor!.rpc("reactivate_client", { p_client_id: clientId, p_subscription_id: null });
        if (result.error) throw result.error;
        return response.json({ ok: true, client: result.data });
      }
      if (!["pending", "paused", "archived"].includes(String(status))) throw new Error("Invalid client status transition.");
      const result = await context.service.from("clients").update({ status }).eq("id", clientId).select("*").single();
      if (result.error) throw result.error;
      return response.json({ ok: true, client: result.data });
    }

    if (status === "churned") {
      const updated = store.safeChurnClient(clientId);
      return response.json({ ok: true, client: updated });
    }

    if (status === "active") {
      const updated = store.reactivateClient(clientId);
      return response.json({ ok: true, client: updated });
    }

    const client = store.clients.find((c) => c.id === clientId);
    if (!client) return response.status(404).json({ ok: false, error: "Client not found." });

    client.status = (status as any) || client.status;
    client.updated_at = new Date().toISOString();

    return response.json({ ok: true, client });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Status update failed." });
  }
}

async function updateAdminWorkflowState(request: Request, response: Response) {
  const context = await adminContext(request, response);
  if (!context) return response.status(401).json({ ok: false, error: "Not authenticated." });

  const workflowId = String(request.params.id || "");
  const { desired_state } = request.body as { desired_state?: "running" | "paused" };

  if (desired_state !== "running" && desired_state !== "paused") {
    return response.status(400).json({ ok: false, error: "Desired state must be running or paused." });
  }

  try {
    if (context.service) {
      const workflow = await context.service.from("workflows").select("id,client_id,n8n_instance_id,actual_state").eq("id", workflowId).single();
      if (workflow.error) throw workflow.error;
      const control = await context.service.from("client_automation_controls").upsert({
        workflow_id: workflowId,
        client_id: workflow.data.client_id,
        n8n_instance_id: workflow.data.n8n_instance_id,
        desired_state,
        actual_state: workflow.data.actual_state,
        sync_status: "pending",
        requested_by_user_id: context.userId,
        requested_at: new Date().toISOString(),
        last_control_error: null,
      }, { onConflict: "workflow_id" }).select("*").single();
      if (control.error) throw control.error;
      const updated = await context.service.from("workflows").update({ desired_state }).eq("id", workflowId).select("*").single();
      if (updated.error) throw updated.error;
      return response.json({ ok: true, workflow: { ...updated.data, sync_status: control.data.sync_status } });
    }

    return response.status(503).json({ ok: false, error: "Live automation control is unavailable without configured Supabase and n8n services." });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Workflow update failed." });
  }
}

async function mapWorkflow(request: Request, response: Response) {
  const context = await adminContext(request, response);
  if (!context) return response.status(401).json({ ok: false, error: "Not authenticated." });

  const body = request.body as {
    discovered_id: string;
    client_id: string;
    business_name: string;
    business_job: string;
  };

  try {
    if (context.service) {
      const discovered = await context.service.from("discovered_workflows").select("n8n_instance_id").eq("id", body.discovered_id).single();
      if (discovered.error) throw discovered.error;
      const connection = await context.service.from("client_connections").select("id").eq("client_id", body.client_id).eq("n8n_instance_id", discovered.data.n8n_instance_id).in("status", ["pending", "connected"]).limit(1).maybeSingle();
      if (connection.error || !connection.data) throw new Error("Connect this client to the workflow's n8n instance before mapping it.");
      const result = await context.actor!.rpc("assign_discovered_workflow", {
        p_discovered_id: body.discovered_id,
        p_client_id: body.client_id,
        p_connection_id: connection.data.id,
        p_template_id: null,
        p_business_name: body.business_name,
        p_business_job: body.business_job,
        p_description: null,
      });
      if (result.error) throw result.error;
      return response.json({ ok: true, workflow: result.data });
    }

    const wf = store.mapDiscoveredWorkflow(body);
    return response.json({ ok: true, workflow: wf });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Workflow mapping failed." });
  }
}

async function deployAutomationTemplate(request: Request, response: Response) {
  const context = await adminContext(request, response);
  if (!context) return response.status(401).json({ ok: false, error: "Not authenticated." });
  if (!context.service) return response.status(503).json({ ok: false, error: "Template deployment requires configured Supabase and n8n services." });
  const clientId = String(request.body?.client_id || "");
  const templateId = String(request.params.id || "");
  const instanceId = String(request.body?.n8n_instance_id || "");
  if (!clientId || !templateId || !instanceId) return response.status(400).json({ ok: false, error: "Client, template, and n8n instance are required." });

  try {
    const [client, template, connection] = await Promise.all([
      context.service.from("clients").select("id,company_name").eq("id", clientId).single(),
      context.service.from("automation_templates").select("id,name,n8n_template_ref,default_config,active").eq("id", templateId).eq("active", true).single(),
      context.service.from("client_connections").select("id,status").eq("client_id", clientId).eq("n8n_instance_id", instanceId).eq("status", "connected").single(),
    ]);
    if (client.error || !client.data) return response.status(404).json({ ok: false, error: "Client not found." });
    if (template.error || !template.data) return response.status(404).json({ ok: false, error: "Active template not found." });
    if (connection.error || !connection.data) return response.status(409).json({ ok: false, error: "Verify the client's n8n connection before deploying a template." });
    const defaultConfig = template.data.default_config as Record<string, unknown> | null;
    const rawDefinition = defaultConfig?.workflow_definition;
    if (!rawDefinition || typeof rawDefinition !== "object" || Array.isArray(rawDefinition)) {
      return response.status(422).json({ ok: false, error: "This template is a configuration catalog entry and has no deployable n8n workflow definition." });
    }
    const definition = rawDefinition as Partial<N8nWorkflowDefinition>;
    if (!Array.isArray(definition.nodes) || !definition.connections || typeof definition.connections !== "object") {
      return response.status(422).json({ ok: false, error: "The template's n8n workflow definition is incomplete." });
    }
    const deployed = await getN8nControlPlane().deployWorkflow(instanceId, {
      name: `${client.data.company_name} — ${template.data.name}`,
      nodes: definition.nodes,
      connections: definition.connections,
      settings: definition.settings || {},
    });
    const discovered = await context.service.rpc("upsert_discovered_workflow", {
      p_instance_id: instanceId,
      p_n8n_workflow_id: String(deployed.id),
      p_discovered_name: deployed.name,
      p_n8n_active: deployed.active === true,
      p_payload: { deployment_source: "automation_template", template_id: templateId },
    });
    if (discovered.error || !discovered.data) throw discovered.error || new Error("Unable to register deployed workflow");
    const assigned = await context.actor!.rpc("assign_discovered_workflow", {
      p_discovered_id: discovered.data.id,
      p_client_id: clientId,
      p_connection_id: connection.data.id,
      p_template_id: templateId,
      p_business_name: template.data.name,
      p_business_job: template.data.name,
      p_description: null,
    });
    if (assigned.error) throw assigned.error;
    return response.status(201).json({ ok: true, workflow: assigned.data, active: deployed.active === true });
  } catch (error) {
    return response.status(502).json({ ok: false, error: error instanceof Error ? error.message : "Template deployment failed." });
  }
}

const onboardingStageKeys = [
  "identity_complete", "portal_complete", "commercial_complete", "infrastructure_complete",
  "automations_complete", "n8n_complete", "account_complete", "verification_complete", "access_sent",
] as const;

async function updateClientOnboarding(request: Request, response: Response) {
  const context = await adminContext(request, response);
  if (!context) return response.status(401).json({ ok: false, error: "Not authenticated." });
  const clientId = String(request.params.id || "");
  const stage = String(request.body?.stage || "") as typeof onboardingStageKeys[number];
  const complete = request.body?.complete;
  if (!onboardingStageKeys.includes(stage) || typeof complete !== "boolean") {
    return response.status(400).json({ ok: false, error: "A valid onboarding stage and completion state are required." });
  }
  if (!context.service) return response.status(503).json({ ok: false, error: "Persisted onboarding stages require Supabase." });

  try {
    if (complete && stage === "automations_complete") {
      const workflows = await context.service.from("workflows").select("id", { count: "exact", head: true }).eq("client_id", clientId);
      if (workflows.error || !workflows.count) return response.status(409).json({ ok: false, error: "Map or deploy at least one workflow before completing automations." });
    }
    if (complete && ["n8n_complete", "verification_complete"].includes(stage)) {
      const connection = await context.service.from("client_connections").select("n8n_instance_id,status").eq("client_id", clientId).eq("status", "connected").limit(1).maybeSingle();
      if (connection.error || !connection.data) return response.status(409).json({ ok: false, error: "A connected n8n client connection is required." });
      if (stage === "verification_complete") {
        const instance = await context.service.from("n8n_instances").select("status,last_sync_status").eq("id", connection.data.n8n_instance_id).single();
        if (instance.error || instance.data?.status !== "active" || instance.data.last_sync_status !== "success") {
          return response.status(409).json({ ok: false, error: "Run a successful n8n verification and telemetry sync first." });
        }
      }
    }
    const existing = await context.service.from("client_onboarding").select("*").eq("client_id", clientId).single();
    if (existing.error || !existing.data) return response.status(404).json({ ok: false, error: "Onboarding record not found." });
    const next = { ...existing.data, [stage]: complete } as Record<string, unknown>;
    const finished = onboardingStageKeys.every((key) => next[key] === true);
    const result = await context.actor!.from("client_onboarding").update({
      [stage]: complete,
      completed_at: finished ? new Date().toISOString() : null,
    }).eq("client_id", clientId).select("*").single();
    if (result.error) throw result.error;
    return response.json({ ok: true, onboarding: result.data });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Unable to update onboarding." });
  }
}

async function onboardClient(request: Request, response: Response) {
  const context = await adminContext(request, response);
  if (!context) return response.status(401).json({ ok: false, error: "Not authenticated." });

  try {
    const payload = request.body as Record<string, unknown>;
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.client_password || "");
    const companyName = String(payload.company_name || "").trim();
    const slug = String(payload.slug || "").trim().toLowerCase();
    const monthlyAmount = Number(payload.monthly_amount || 0);
    const billingDay = Number(payload.billing_day || 1);
    const currency = String(payload.currency || "INR").trim().toUpperCase();
    const allowedModules = new Set(["overview", "automations", "results", "billing", "support", "profile"]);
    const enabledModules = Array.isArray(payload.enabled_modules)
      ? Array.from(new Set(payload.enabled_modules.map((module) => String(module).trim().toLowerCase()).filter(Boolean)))
      : [];
    const logoUrl = String(payload.logo_url || "").trim();
    if (!companyName || companyName.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Company name and a valid client email are required.");
    if (password.length < 12 || password.length > 128) throw new Error("Initial client password must contain 12-128 characters.");
    if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) throw new Error("Portal slug must be 3-64 lowercase letters, numbers, or hyphens.");
    if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0 || !Number.isInteger(billingDay) || billingDay < 1 || billingDay > 28) throw new Error("Monthly amount and billing day must be valid.");
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a three-letter ISO code.");
    if (!enabledModules.length || enabledModules.some((module) => !allowedModules.has(module))) throw new Error("Select valid client portal modules.");
    if (!/^#[0-9a-f]{6}$/i.test(String(payload.primary_color || "")) || !/^#[0-9a-f]{6}$/i.test(String(payload.accent_color || ""))) throw new Error("Valid portal brand colors are required.");
    if (logoUrl) {
      try {
        const parsedLogo = new URL(logoUrl);
        if (!['http:', 'https:'].includes(parsedLogo.protocol)) throw new Error();
      } catch {
        throw new Error("Logo URL must use HTTP or HTTPS.");
      }
    }
    const normalizedPayload = { ...payload, company_name: companyName, email, slug, monthly_amount: monthlyAmount, billing_day: billingDay, currency, enabled_modules: enabledModules, logo_url: logoUrl || null };

    if (context.service) {
      const fullName = String(payload.contact_name || companyName).trim();
      const authResult = await context.service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: "client", full_name: fullName },
      });
      if (authResult.error || !authResult.data.user) throw authResult.error || new Error("Unable to create client authentication account.");

      const safePayload: Record<string, unknown> = { ...normalizedPayload };
      delete safePayload.client_password;
      const result = await context.actor!.rpc("admin_onboard_client", {
        p_payload: safePayload,
        p_auth_user_id: authResult.data.user.id,
      });
      if (result.error) {
        await context.service.auth.admin.deleteUser(authResult.data.user.id);
        if (result.error.message.includes("admin_onboard_client")) {
          throw new Error("Database onboarding migration is missing. Apply the repository Supabase migrations and retry.");
        }
        throw result.error;
      }
      return response.status(201).json({ ok: true, ...(result.data as Record<string, unknown>) });
    }

    const result = store.onboardClient(normalizedPayload as any);
    return response.status(201).json({ ok: true, ...result });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Client onboarding failed." });
  }
}

async function verifyN8nInstance(request: Request, response: Response) {
  const context = await adminContext(request, response);
  if (!context) return response.status(401).json({ ok: false, error: "Not authenticated." });

  const instanceId = String(request.params.id || "");
  if (context.service) {
    const result = await getN8nControlPlane().runCycle(instanceId);
    const instanceResult = result.results[0];
    if (!instanceResult?.ok) {
      return response.status(502).json({
        ok: false,
        error: instanceResult?.error || result.reason || "n8n synchronization failed.",
        result: instanceResult || null,
      });
    }
    return response.json({ ok: true, status: "verified", result: instanceResult });
  }

  return response.status(503).json({ ok: false, error: "Live n8n verification requires configured Supabase and Vault-backed n8n credentials." });
}

async function syncN8nInstances(request: Request, response: Response) {
  const context = await adminContext(request, response);
  if (!context) return response.status(401).json({ ok: false, error: "Not authenticated." });
  if (!context.service) return response.status(503).json({ ok: false, error: "Live n8n synchronization requires configured Supabase and Vault-backed n8n credentials." });

  try {
    const result = await getN8nControlPlane().runCycle();
    return response.status(result.ok ? 200 : 502).json(result);
  } catch (error) {
    return response.status(502).json({ ok: false, error: error instanceof Error ? error.message : "n8n synchronization failed." });
  }
}

type N8nEventInput = {
  instance_id?: unknown;
  n8n_workflow_id?: unknown;
  source_execution_id?: unknown;
  source_event_key?: unknown;
  kind?: unknown;
  event_type?: unknown;
  event_value?: unknown;
  currency?: unknown;
  occurred_at?: unknown;
  started_at?: unknown;
  finished_at?: unknown;
  status?: unknown;
  severity?: unknown;
  success?: unknown;
  duration_ms?: unknown;
  error_code?: unknown;
  error_message?: unknown;
  client_visible?: unknown;
  payload?: unknown;
};

function boundedString(value: unknown, name: string, maxLength: number, required = true) {
  const result = typeof value === "string" ? value.trim() : "";
  if ((required && !result) || result.length > maxLength) throw new Error(`${name} is invalid`);
  return result || null;
}

function validTimestamp(value: unknown, name = "occurred_at") {
  if (value === undefined || value === null || value === "") return new Date().toISOString();
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`${name} is invalid`);
  return new Date(value).toISOString();
}

function integrationAuthorized(request: Request) {
  const configured = process.env.N8N_EVENT_INGEST_SECRET || "";
  const authorization = request.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!configured || !supplied) return false;
  const configuredBuffer = Buffer.from(configured);
  const suppliedBuffer = Buffer.from(supplied);
  return configuredBuffer.length === suppliedBuffer.length && timingSafeEqual(configuredBuffer, suppliedBuffer);
}

function integrationRateLimit(request: Request, response: Response) {
  const key = request.ip || request.headers["x-forwarded-for"]?.toString() || "unknown";
  const now = Date.now();
  const current = integrationAttempts.get(key);
  if (!current || current.resetAt <= now) {
    integrationAttempts.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 600) {
    response.setHeader("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
    response.status(429).json({ ok: false, error: "Event ingestion rate limit exceeded." });
    return false;
  }
  current.count += 1;
  return true;
}

async function ingestN8nEvents(request: Request, response: Response) {
  if (!integrationRateLimit(request, response)) return;
  if (!integrationAuthorized(request)) return response.status(401).json({ ok: false, error: "Invalid integration credentials." });
  if (!isSupabaseConfigured()) return response.status(503).json({ ok: false, error: "Event ingestion is unavailable." });

  const requestedEvents = Array.isArray(request.body?.events) ? request.body.events : [request.body];
  if (!requestedEvents.length || requestedEvents.length > 100) {
    return response.status(400).json({ ok: false, error: "Submit between 1 and 100 events." });
  }

  try {
    const service = createServiceClient();
    let accepted = 0;
    for (const rawEvent of requestedEvents as N8nEventInput[]) {
      if (!rawEvent || typeof rawEvent !== "object" || Array.isArray(rawEvent)) throw new Error("event is invalid");
      const instanceId = boundedString(rawEvent.instance_id, "instance_id", 64)!;
      const remoteWorkflowId = boundedString(rawEvent.n8n_workflow_id, "n8n_workflow_id", 255)!;
      const sourceEventKey = boundedString(rawEvent.source_event_key, "source_event_key", 255)!;
      const sourceExecutionId = boundedString(rawEvent.source_execution_id, "source_execution_id", 255, false);
      const eventType = boundedString(rawEvent.event_type, "event_type", 100)!;
      const kind = rawEvent.kind === "business" ? "business" : rawEvent.kind === "automation" ? "automation" : null;
      if (!kind) throw new Error("kind must be business or automation");
      const occurredAt = validTimestamp(rawEvent.occurred_at);
      const payload = rawEvent.payload === undefined ? {} : rawEvent.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("payload must be an object");

      const workflow = await service.from("workflows")
        .select("id,client_id,n8n_instance_id,n8n_workflow_id,client_visible")
        .eq("n8n_instance_id", instanceId)
        .eq("n8n_workflow_id", remoteWorkflowId)
        .single();
      if (workflow.error || !workflow.data) throw new Error("Mapped workflow was not found");

      if (kind === "business") {
        const eventValue = rawEvent.event_value === undefined || rawEvent.event_value === null ? null : Number(rawEvent.event_value);
        if (eventValue !== null && !Number.isFinite(eventValue)) throw new Error("event_value is invalid");
        const currency = boundedString(rawEvent.currency, "currency", 3, false)?.toUpperCase() || null;
        const result = await service.rpc("ingest_business_event", {
          p_client_id: workflow.data.client_id,
          p_n8n_instance_id: instanceId,
          p_workflow_id: workflow.data.id,
          p_event_type: eventType,
          p_event_value: eventValue,
          p_currency: currency,
          p_occurred_at: occurredAt,
          p_source_execution_id: sourceExecutionId,
          p_source_event_key: sourceEventKey,
          p_payload: payload,
        });
        if (result.error) throw result.error;
      } else {
        const duration = rawEvent.duration_ms === undefined || rawEvent.duration_ms === null ? null : Number(rawEvent.duration_ms);
        if (duration !== null && (!Number.isSafeInteger(duration) || duration < 0)) throw new Error("duration_ms is invalid");
        const errorMessage = boundedString(rawEvent.error_message, "error_message", 500, false);
        const result = await service.rpc("ingest_automation_event", {
          p_client_id: workflow.data.client_id,
          p_n8n_instance_id: instanceId,
          p_workflow_id: workflow.data.id,
          p_source_execution_id: sourceExecutionId,
          p_source_event_key: sourceEventKey,
          p_event_type: eventType,
          p_severity: boundedString(rawEvent.severity, "severity", 30, false) || "info",
          p_occurred_at: occurredAt,
          p_success: typeof rawEvent.success === "boolean" ? rawEvent.success : null,
          p_duration_ms: duration,
          p_error_code: boundedString(rawEvent.error_code, "error_code", 100, false),
          p_error_message: errorMessage,
          p_client_visible: typeof rawEvent.client_visible === "boolean" ? rawEvent.client_visible : workflow.data.client_visible,
          p_payload: payload,
        });
        if (result.error) throw result.error;
        if (sourceExecutionId) {
          const status = boundedString(rawEvent.status, "status", 50, false)
            || (rawEvent.success === true ? "success" : rawEvent.success === false ? "error" : eventType);
          const run = await service.rpc("record_workflow_run", {
            p_workflow_id: workflow.data.id,
            p_source_execution_id: sourceExecutionId,
            p_started_at: rawEvent.started_at ? validTimestamp(rawEvent.started_at, "started_at") : occurredAt,
            p_finished_at: rawEvent.finished_at ? validTimestamp(rawEvent.finished_at, "finished_at") : occurredAt,
            p_status: status,
            p_duration_ms: duration,
            p_error_message: errorMessage,
            p_client_visible: typeof rawEvent.client_visible === "boolean" ? rawEvent.client_visible : workflow.data.client_visible,
            p_payload: payload,
          });
          if (run.error) throw run.error;
        }
      }
      accepted += 1;
    }
    return response.status(202).json({ ok: true, accepted });
  } catch (error) {
    console.error("n8n event ingestion rejected", error instanceof Error ? error.message : "Unknown ingestion error");
    return response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Event ingestion failed." });
  }
}

async function updateTask(request: Request, response: Response) {
  const context = await adminContext(request, response);
  if (!context) return response.status(401).json({ ok: false, error: "Not authenticated." });
  const taskId = String(request.params.id || "");
  const status = String(request.body?.status || "");
  const allowed = ["todo", "in_progress", "blocked", "completed", "cancelled"];
  if (!allowed.includes(status)) return response.status(400).json({ ok: false, error: "Invalid task status." });

  try {
    if (context.service) {
      const result = await context.service.from("tasks").update({
        status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
      }).eq("id", taskId).select("*").single();
      if (result.error) throw result.error;
      return response.json({ ok: true, task: result.data });
    }
    const task = store.tasks.find((item) => item.id === taskId);
    if (!task) return response.status(404).json({ ok: false, error: "Task not found." });
    task.status = (status === "completed" ? "done" : status) as typeof task.status;
    task.completed_at = status === "completed" ? new Date().toISOString() : null;
    return response.json({ ok: true, task: { ...task, status: task.status === "done" ? "completed" : task.status } });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Task update failed." });
  }
}

async function updateSupportTicket(request: Request, response: Response) {
  const context = await adminContext(request, response);
  if (!context) return response.status(401).json({ ok: false, error: "Not authenticated." });
  const ticketId = String(request.params.id || "");
  const status = String(request.body?.status || "");
  const internalNotes = String(request.body?.internal_notes || "").trim();
  const priority = request.body?.priority ? String(request.body.priority) : null;
  const assignToMe = request.body?.assign_to_me === true;
  const allowed = ["open", "pending_client", "pending_admin", "resolved", "closed"];
  if (!allowed.includes(status)) return response.status(400).json({ ok: false, error: "Invalid ticket status." });
  if (priority && !["low", "normal", "high", "urgent"].includes(priority)) return response.status(400).json({ ok: false, error: "Invalid ticket priority." });

  try {
    if (context.service) {
      const ticket = await context.service.from("support_tickets").select("client_id").eq("id", ticketId).single();
      if (ticket.error) throw ticket.error;
      const result = await context.service.from("support_tickets").update({
        status,
        ...(priority ? { priority } : {}),
        ...(assignToMe ? { assigned_to_user_id: context.userId } : {}),
        resolved_at: status === "resolved" || status === "closed" ? new Date().toISOString() : null,
      }).eq("id", ticketId).select("*").single();
      if (result.error) throw result.error;
      if (internalNotes) {
        const previous = await context.service.from("support_ticket_messages").select("message").eq("ticket_id", ticketId).eq("internal", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (previous.error) throw previous.error;
        if (previous.data?.message !== internalNotes) {
          const note = await context.service.from("support_ticket_messages").insert({
            ticket_id: ticketId,
            client_id: ticket.data.client_id,
            sender_user_id: context.userId,
            message: internalNotes,
            internal: true,
          });
          if (note.error) throw note.error;
        }
      }
      return response.json({ ok: true, ticket: { ...result.data, internal_notes: internalNotes } });
    }
    const ticket = store.supportTickets.find((item) => item.id === ticketId);
    if (!ticket) return response.status(404).json({ ok: false, error: "Ticket not found." });
    const localStatus: Record<string, typeof ticket.status> = { pending_admin: "in_progress", pending_client: "waiting_client" };
    ticket.status = localStatus[status] || status as typeof ticket.status;
    if (priority) ticket.priority = (priority === "normal" ? "medium" : priority) as typeof ticket.priority;
    ticket.internal_notes = internalNotes || null;
    return response.json({ ok: true, ticket });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Ticket update failed." });
  }
}

async function addAdminTicketMessage(request: Request, response: Response) {
  const context = await adminContext(request, response);
  if (!context) return response.status(401).json({ ok: false, error: "Not authenticated." });
  const ticketId = String(request.params.id || "");
  const message = typeof request.body?.message === "string" ? request.body.message.trim() : "";
  if (!message || message.length > 5000) return response.status(400).json({ ok: false, error: "Enter a reply of 1–5000 characters." });

  try {
    if (context.service) {
      const ticket = await context.service.from("support_tickets").select("id,client_id,status").eq("id", ticketId).single();
      if (ticket.error || !ticket.data) return response.status(404).json({ ok: false, error: "Ticket not found." });
      if (ticket.data.status === "closed") return response.status(400).json({ ok: false, error: "Closed tickets cannot receive replies." });
      const inserted = await context.service.from("support_ticket_messages").insert({
        ticket_id: ticket.data.id,
        client_id: ticket.data.client_id,
        sender_user_id: context.userId,
        message,
        internal: false,
      }).select("id,ticket_id,sender_user_id,message,created_at").single();
      if (inserted.error) throw inserted.error;
      const updated = await context.service.from("support_tickets").update({ status: "pending_client" }).eq("id", ticketId);
      if (updated.error) throw updated.error;
      return response.status(201).json({ ok: true, message: inserted.data, status: "pending_client" });
    }
    const ticket = store.supportTickets.find((item) => item.id === ticketId);
    if (!ticket) return response.status(404).json({ ok: false, error: "Ticket not found." });
    const reply = { id: `msg-${Date.now()}`, ticket_id: ticket.id, sender_user_id: context.userId, message, internal: false, created_at: new Date().toISOString() };
    ticket.messages = [...(ticket.messages || []), reply];
    ticket.status = "waiting_client";
    return response.status(201).json({ ok: true, message: reply, status: "pending_client" });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Unable to send reply." });
  }
}

async function updatePortalConfig(request: Request, response: Response) {
  const context = await adminContext(request, response);
  if (!context) return response.status(401).json({ ok: false, error: "Not authenticated." });
  const clientId = String(request.params.id || "");
  const body = request.body as Record<string, unknown>;
  const slug = String(body.slug || "").trim().toLowerCase();
  const portalTitle = String(body.portal_title || "").trim();
  const primaryColor = String(body.primary_color || "");
  const accentColor = String(body.accent_color || "");
  const enabledModules = Array.isArray(body.enabled_modules)
    ? Array.from(new Set(body.enabled_modules.map((module) => String(module).trim().toLowerCase()).filter(Boolean)))
    : [];
  const allowedModules = new Set(["overview", "automations", "results", "billing", "support", "profile"]);
  const dashboardConfig = body.dashboard_config && typeof body.dashboard_config === "object" && !Array.isArray(body.dashboard_config) ? body.dashboard_config as Record<string, unknown> : null;
  const terminology = body.terminology && typeof body.terminology === "object" && !Array.isArray(body.terminology) ? body.terminology as Record<string, unknown> : null;
  const clientSettingsSchema = body.client_settings_schema && typeof body.client_settings_schema === "object" && !Array.isArray(body.client_settings_schema) ? body.client_settings_schema as Record<string, unknown> : null;
  const kpiConfig = Array.isArray(body.kpi_config) ? body.kpi_config : [];
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) return response.status(400).json({ ok: false, error: "Use a 3-64 character lowercase portal slug." });
  if (!portalTitle || portalTitle.length > 120 || !/^#[0-9a-f]{6}$/i.test(primaryColor) || !/^#[0-9a-f]{6}$/i.test(accentColor)) return response.status(400).json({ ok: false, error: "Portal title and valid brand colors are required." });
  if (!enabledModules.length || enabledModules.some((module) => !allowedModules.has(module))) return response.status(400).json({ ok: false, error: "Select valid portal modules." });
  if (!dashboardConfig || !terminology || !clientSettingsSchema || kpiConfig.length > 20) return response.status(400).json({ ok: false, error: "Portal layout, terminology, settings, and KPI configuration must be valid objects." });
  if ([dashboardConfig, terminology, clientSettingsSchema, kpiConfig].some((value) => JSON.stringify(value).length > 20_000)) return response.status(400).json({ ok: false, error: "Portal configuration is too large." });
  if (Object.entries(terminology).some(([key, value]) => !/^[a-z0-9_]{1,50}$/i.test(key) || typeof value !== "string" || value.trim().length > 80)) return response.status(400).json({ ok: false, error: "Terminology keys and labels are invalid." });
  if (kpiConfig.some((item) => !item || typeof item !== "object" || Array.isArray(item) || !/^[a-z0-9_]{1,80}$/i.test(String((item as any).key || "")) || String((item as any).label || "").length > 100 || !["tracked", "derived", "estimated", undefined].includes((item as any).type))) return response.status(400).json({ ok: false, error: "KPI definitions require valid keys, labels, and metric types." });
  const allowedCards = new Set(["retainer", "automations", "executions", "requests"]);
  for (const key of ["visible_cards", "card_order"] as const) {
    const value = dashboardConfig[key];
    if (value !== undefined && (!Array.isArray(value) || value.some((item) => !allowedCards.has(String(item))))) return response.status(400).json({ ok: false, error: `${key} contains an unsupported dashboard card.` });
  }
  if (dashboardConfig.density !== undefined && !["comfortable", "compact"].includes(String(dashboardConfig.density))) return response.status(400).json({ ok: false, error: "Visual density must be comfortable or compact." });
  if (dashboardConfig.layout !== undefined && !["balanced", "wide", "stacked"].includes(String(dashboardConfig.layout))) return response.status(400).json({ ok: false, error: "Dashboard layout is invalid." });
  if (dashboardConfig.module_order !== undefined && (!Array.isArray(dashboardConfig.module_order) || dashboardConfig.module_order.some((item) => !allowedModules.has(String(item))))) return response.status(400).json({ ok: false, error: "Module order contains an unsupported section." });
  if (dashboardConfig.company_display_name !== undefined && (typeof dashboardConfig.company_display_name !== "string" || dashboardConfig.company_display_name.trim().length > 120)) return response.status(400).json({ ok: false, error: "Company display name is invalid." });
  const logoUrl = body.logo_url ? String(body.logo_url).trim() : "";
  const faviconUrl = body.favicon_url ? String(body.favicon_url).trim() : "";
  for (const candidate of [logoUrl, faviconUrl].filter(Boolean)) {
    try {
      const parsed = new URL(candidate);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      return response.status(400).json({ ok: false, error: "Logo and favicon URLs must use HTTP or HTTPS." });
    }
  }

  const update = {
    slug,
    portal_title: portalTitle,
    logo_url: logoUrl || null,
    favicon_url: faviconUrl || null,
    primary_color: primaryColor,
    accent_color: accentColor,
    enabled_modules: enabledModules,
    dashboard_config: dashboardConfig,
    kpi_config: kpiConfig,
    terminology,
    client_settings_schema: clientSettingsSchema,
  };

  try {
    if (context.service) {
      const result = await context.service.from("client_portal_config").update(update).eq("client_id", clientId).select("*").single();
      if (result.error) throw result.error;
      return response.json({ ok: true, portal: result.data });
    }
    const portal = store.portalConfigs[clientId];
    if (!portal) return response.status(404).json({ ok: false, error: "Portal configuration not found." });
    Object.assign(portal, update);
    return response.json({ ok: true, portal });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Portal update failed." });
  }
}

async function healthCheck(_request: Request, response: Response) {
  if (!isSupabaseConfigured()) {
    return response.status(isProduction ? 503 : 200).json({
      ok: !isProduction,
      status: isProduction ? "not_ready" : "development",
      database: "not_configured",
    });
  }

  try {
    const result = await createServiceClient().from("profiles").select("user_id").limit(1);
    if (result.error) throw result.error;
    return response.json({ ok: true, status: "ready", database: "connected" });
  } catch {
    return response.status(503).json({ ok: false, status: "not_ready", database: "unavailable" });
  }
}

// --------------------------------------------------------------------------
// EXPRESS APP CONFIGURATION
// --------------------------------------------------------------------------

export function createApiApp() {
  const app = express();
  app.disable("x-powered-by");
  if (isProduction) app.set("trust proxy", 1);
  app.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    next();
  });
  app.use((request, response, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
    const origin = request.get("origin");
    const host = request.get("x-forwarded-host") || request.get("host");
    if (origin && host) {
      try {
        if (new URL(origin).host !== host) return response.status(403).json({ ok: false, error: "Cross-origin request rejected." });
      } catch {
        return response.status(403).json({ ok: false, error: "Invalid request origin." });
      }
    }
    next();
  });
  app.use(express.json({ limit: "64kb" }));

  // Public & Authentication
  app.get("/api/health", healthCheck);
  app.post("/api/auth/admin", adminLogin);
  app.post("/api/auth/client", clientLogin);
  app.post("/api/auth/recovery/request", requestPasswordRecovery);
  app.post("/api/auth/recovery/complete", completePasswordRecovery);
  app.post("/api/portal/auth", clientLogin);
  app.post("/api/portal/login", clientLogin);
  app.get("/api/auth/me", currentSession);
  app.get("/api/auth/session", currentSession);
  app.get("/api/auth/user", currentSession);
  app.get("/api/auth/client-access/:slug", clientAccess);
  app.post("/api/auth/logout", (_request, response) => {
    clearSession(response);
    response.json({ ok: true });
  });
  app.post("/api/portal/logout", (_request, response) => {
    clearSession(response);
    response.json({ ok: true });
  });

  // Trusted n8n push events. Authentication is independent of browser sessions.
  app.post("/api/integrations/n8n/events", ingestN8nEvents);

  // Client Portal (Tenant-Isolated)
  app.get("/api/portal/:slug/summary", portalSummary);
  app.get("/api/portal/:slug/data", portalSummary);
  app.post("/api/portal/:slug/workflows/:workflowId/state", updateClientAutomationState);
  app.patch("/api/portal/:slug/workflows/:workflowId/state", updateClientAutomationState);
  app.post("/api/portal/:slug/tickets", submitClientTicket);
  app.post("/api/portal/:slug/support/tickets", submitClientTicket);
  app.post("/api/portal/:slug/tickets/:ticketId/messages", replyToClientTicket);
  app.patch("/api/portal/:slug/profile", updateClientProfile);

  // Admin Command Center
  app.get("/api/admin/overview", adminOverview);
  app.get("/api/admin/data/:resource", adminData);
  app.post("/api/admin/data/:resource", adminWrite);
  app.post("/api/admin/clients", onboardClient);
  app.patch("/api/admin/clients/:id/portal-config", updatePortalConfig);
  app.patch("/api/admin/clients/:id/status", updateClientStatus);
  app.post("/api/admin/clients/:id/churn", (req, res) => { req.body = { status: "churned" }; return updateClientStatus(req, res); });
  app.post("/api/admin/clients/:id/reactivate", (req, res) => { req.body = { status: "active" }; return updateClientStatus(req, res); });
  app.patch("/api/admin/workflows/:id/state", updateAdminWorkflowState);
  app.patch("/api/admin/tasks/:id", updateTask);
  app.patch("/api/admin/support-tickets/:id", updateSupportTicket);
  app.post("/api/admin/support-tickets/:id/messages", addAdminTicketMessage);
  app.post("/api/admin/workflows/map", mapWorkflow);
  app.post("/api/admin/onboarding", onboardClient);
  app.post("/api/admin/n8n-instances/:id/verify", verifyN8nInstance);
  app.post("/api/admin/n8n/sync", syncN8nInstances);
  app.post("/api/admin/automation-templates/:id/deploy", deployAutomationTemplate);
  app.patch("/api/admin/clients/:id/onboarding", updateClientOnboarding);

  return app;
}

export function createApp() {
  const app = express();
  app.use(createApiApp());
  const staticPath = isProduction ? path.resolve(__dirname, "public") : path.resolve(__dirname, "..", "dist", "public");
  app.use(express.static(staticPath));
  app.get("*", (_request, response) => response.sendFile(path.join(staticPath, "index.html")));
  return app;
}

export async function startServer() {
  if (isProduction) {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      throw new Error("SESSION_SECRET must be configured with at least 32 characters in production.");
    }
    if (!isSupabaseConfigured()) {
      throw new Error("SUPABASE_URL, a Supabase publishable key, and a Supabase secret key are required in production.");
    }
    publicAppUrl({ protocol: "https", get: () => undefined } as unknown as Request);
  }
  const server = createServer(createApp());
  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));
  if (isSupabaseConfigured() && process.env.N8N_SYNC_ENABLED === "true") {
    const stopN8nScheduler = startN8nControlScheduler(
      getN8nControlPlane(),
      Number(process.env.N8N_SYNC_INTERVAL_MS || 60_000),
    );
    server.on("close", stopN8nScheduler);
  }
  return server;
}

const invokedDirectly = process.argv[1]?.endsWith("dist/index.js") || process.argv[1]?.endsWith("server/index.ts");
if (invokedDirectly && process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  startServer().catch((error) => {
    console.error("Unable to start VectorOps server", error);
    process.exitCode = 1;
  });
}
