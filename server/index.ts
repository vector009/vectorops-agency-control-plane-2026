import express, { type Request, type Response } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_COOKIE = "vectorops_session";
const isProduction = process.env.NODE_ENV === "production";
type Session = { access_token: string; refresh_token: string };
type Profile = { user_id: string; role: "admin" | "client"; client_id: string | null; full_name: string | null };

function config() {
  return { url: process.env.VITE_SUPABASE_URL, anonKey: process.env.VITE_SUPABASE_ANON_KEY, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY, adminEmail: process.env.ADMIN_AUTH_EMAIL };
}

function createAnonClient() {
  const { url, anonKey } = config();
  if (!url || !anonKey) throw new Error("Supabase client configuration is incomplete");
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function createServiceClient(): SupabaseClient {
  const { url, serviceRoleKey } = config();
  if (!url || !serviceRoleKey) throw new Error("Supabase server configuration is incomplete");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.cookie || "";
  const item = cookieHeader.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

function writeSession(response: Response, session: Session) {
  const value = encodeURIComponent(JSON.stringify(session));
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=${value}; Max-Age=${60 * 60 * 8}; Path=/; HttpOnly; SameSite=Lax${isProduction ? "; Secure" : ""}`);
}

function clearSession(response: Response) {
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${isProduction ? "; Secure" : ""}`);
}

function genericAuthFailure(response: Response) {
  return response.status(401).json({ ok: false, error: "Incorrect password." });
}

async function profileForUser(service: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await service.from("profiles").select("user_id,role,client_id,full_name").eq("user_id", userId).limit(1).maybeSingle();
  if (error || !data) return null;
  return data as Profile;
}

async function signInWithIdentity(email: string, password: string) {
  return createAnonClient().auth.signInWithPassword({ email, password });
}

async function adminLogin(request: Request, response: Response) {
  const { password } = request.body as { password?: unknown };
  const { adminEmail } = config();
  if (typeof password !== "string" || password.length === 0 || !adminEmail) return genericAuthFailure(response);
  try {
    const result = await signInWithIdentity(adminEmail, password);
    if (result.error || !result.data.session || !result.data.user) return genericAuthFailure(response);
    const profile = await profileForUser(createServiceClient(), result.data.user.id);
    if (!profile || profile.role !== "admin") return response.status(403).json({ ok: false, error: "This account does not have administrator access." });
    writeSession(response, { access_token: result.data.session.access_token, refresh_token: result.data.session.refresh_token });
    return response.json({ ok: true, role: "admin", name: profile.full_name || "VectorOps Admin" });
  } catch {
    return response.status(503).json({ ok: false, error: "We couldn't verify your access right now. Please try again." });
  }
}

async function clientLogin(request: Request, response: Response) {
  const { slug, password } = request.body as { slug?: unknown; password?: unknown };
  if (typeof slug !== "string" || typeof password !== "string" || !slug || !password) return genericAuthFailure(response);
  try {
    const service = createServiceClient();
    const portal = await service.from("client_portal_config").select("client_id,slug,portal_title").eq("slug", slug.toLowerCase()).limit(1).maybeSingle();
    if (portal.error || !portal.data) return response.status(401).json({ ok: false, error: "You don't have access to this portal." });
    const profileResult = await service.from("profiles").select("user_id,role,client_id,full_name").eq("client_id", portal.data.client_id).eq("role", "client").limit(1).maybeSingle();
    if (profileResult.error || !profileResult.data) return response.status(401).json({ ok: false, error: "You don't have access to this portal." });
    const authUser = await service.auth.admin.getUserById(profileResult.data.user_id);
    const email = authUser.data.user?.email;
    if (!email) return response.status(401).json({ ok: false, error: "You don't have access to this portal." });
    const result = await signInWithIdentity(email, password);
    if (result.error || !result.data.session || !result.data.user || result.data.user.id !== profileResult.data.user_id) return genericAuthFailure(response);
    writeSession(response, { access_token: result.data.session.access_token, refresh_token: result.data.session.refresh_token });
    return response.json({ ok: true, role: "client", slug: portal.data.slug, title: portal.data.portal_title });
  } catch {
    return response.status(503).json({ ok: false, error: "We couldn't verify your access right now. Please try again." });
  }
}

async function currentSession(request: Request, response: Response) {
  const raw = readCookie(request, SESSION_COOKIE);
  if (!raw) return response.status(401).json({ ok: false, error: "Not authenticated." });
  try {
    const session = JSON.parse(raw) as Session;
    const { data, error } = await createAnonClient().auth.getUser(session.access_token);
    if (error || !data.user) return response.status(401).json({ ok: false, error: "Not authenticated." });
    const profile = await profileForUser(createServiceClient(), data.user.id);
    if (!profile) return response.status(403).json({ ok: false, error: "This account is currently unavailable." });
    return response.json({ ok: true, user: { id: profile.user_id, role: profile.role, client_id: profile.client_id, name: profile.full_name } });
  } catch {
    return response.status(401).json({ ok: false, error: "Not authenticated." });
  }
}

async function clientAccess(request: Request, response: Response) {
  const raw = readCookie(request, SESSION_COOKIE);
  const slug = String(request.params.slug || "").toLowerCase();
  if (!raw || !slug) return response.status(401).json({ ok: false, error: "You don't have access to this portal." });
  try {
    const session = JSON.parse(raw) as Session;
    const { data, error } = await createAnonClient().auth.getUser(session.access_token);
    if (error || !data.user) return response.status(401).json({ ok: false, error: "You don't have access to this portal." });
    const service = createServiceClient();
    const profile = await profileForUser(service, data.user.id);
    if (!profile || profile.role !== "client" || !profile.client_id) return response.status(403).json({ ok: false, error: "You don't have access to this portal." });
    const portal = await service.from("client_portal_config").select("client_id,slug,portal_title").eq("client_id", profile.client_id).eq("slug", slug).limit(1).maybeSingle();
    if (portal.error || !portal.data) return response.status(403).json({ ok: false, error: "You don't have access to this portal." });
    return response.json({ ok: true, slug: portal.data.slug, title: portal.data.portal_title });
  } catch {
    return response.status(401).json({ ok: false, error: "You don't have access to this portal." });
  }
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.post("/api/auth/admin", adminLogin);
  app.post("/api/auth/client", clientLogin);
  app.get("/api/auth/me", currentSession);
  app.get("/api/auth/client-access/:slug", clientAccess);
  app.post("/api/auth/logout", (_request, response) => { clearSession(response); response.json({ ok: true }); });
  const staticPath = isProduction ? path.resolve(__dirname, "public") : path.resolve(__dirname, "..", "dist", "public");
  app.use(express.static(staticPath));
  app.get("*", (_request, response) => response.sendFile(path.join(staticPath, "index.html")));
  return app;
}

export async function startServer() {
  const server = createServer(createApp());
  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));
  return server;
}

if (process.env.NODE_ENV !== "test" && !process.env.VITEST) startServer().catch((error) => { console.error("Unable to start VectorOps server", error); process.exitCode = 1; });
