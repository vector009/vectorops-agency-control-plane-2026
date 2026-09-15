import express, { type Request, type Response } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_COOKIE = "vectorops_session";
const isProduction = process.env.NODE_ENV === "production";
const authAttempts = new Map<string, { count: number; resetAt: number }>();
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

function authRateLimit(request: Request, response: Response) { const key = request.ip || request.headers["x-forwarded-for"]?.toString() || "unknown"; const now = Date.now(); const current = authAttempts.get(key); if (!current || current.resetAt <= now) { authAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 }); return true; } if (current.count >= 10) { response.setHeader("Retry-After", String(Math.ceil((current.resetAt - now) / 1000))); response.status(429).json({ ok: false, error: "Too many attempts. Please wait 15 minutes and try again." }); return false; } current.count += 1; return true; }

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
  if (!authRateLimit(request, response)) return;
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
  if (!authRateLimit(request, response)) return;
  const { slug, password } = request.body as { slug?: unknown; password?: unknown };
  if (typeof slug !== "string" || typeof password !== "string" || !slug || !password) return genericAuthFailure(response);
  try {
    const service = createServiceClient();
    const portal = await service.from("client_portal_config").select("client_id,slug,portal_title").eq("slug", slug.toLowerCase()).limit(1).maybeSingle();
    if (portal.error || !portal.data) return response.status(401).json({ ok: false, error: "You don't have access to this portal." });
    const clientRecord = await service.from("clients").select("id,status").eq("id", portal.data.client_id).limit(1).maybeSingle();
    if (clientRecord.error || !clientRecord.data || clientRecord.data.status === "churned" || clientRecord.data.status === "archived") return response.status(403).json({ ok: false, error: "This client portal is currently unavailable." });
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

async function portalSummary(request: Request, response: Response) {
  const raw = readCookie(request, SESSION_COOKIE);
  const slug = String(request.params.slug || "").toLowerCase();
  if (!raw || !slug) return response.status(401).json({ ok: false, error: "You don't have access to this portal." });
  try {
    const session = JSON.parse(raw) as Session;
    const { data: auth, error: authError } = await createAnonClient().auth.getUser(session.access_token);
    if (authError || !auth.user) return response.status(401).json({ ok: false, error: "You don't have access to this portal." });
    const service = createServiceClient();
    const profile = await profileForUser(service, auth.user.id);
    if (!profile || profile.role !== "client" || !profile.client_id) return response.status(403).json({ ok: false, error: "You don't have access to this portal." });
    const portal = await service.from("client_portal_config").select("client_id,slug,portal_title,logo_url,primary_color,accent_color,enabled_modules,dashboard_config,kpi_config,terminology,client_settings_schema").eq("client_id", profile.client_id).eq("slug", slug).limit(1).maybeSingle();
    if (portal.error || !portal.data) return response.status(403).json({ ok: false, error: "You don't have access to this portal." });
    const [client, workflows, invoices, tasks, tickets, controls, reports, metrics] = await Promise.all([
      service.from("clients").select("id,company_name,contact_name,status,email").eq("id", profile.client_id).limit(1).maybeSingle(),
      service.from("workflows").select("id,workflow_name,status,desired_state,actual_state,last_success_at,last_failure_at,client_visible").eq("client_id", profile.client_id).eq("client_visible", true).limit(8),
      service.from("invoices").select("id,invoice_number,total_amount,amount_paid,status,due_date").eq("client_id", profile.client_id).order("due_date", { ascending: false }).limit(8),
      service.from("tasks").select("id,title,status,priority,due_at,completed_at").eq("client_id", profile.client_id).order("due_at", { ascending: true }).limit(8),
      service.from("support_tickets").select("id,ticket_number,subject,status,priority,created_at").eq("client_id", profile.client_id).order("created_at", { ascending: false }).limit(8),
      service.from("client_automation_controls").select("id,workflow_id,desired_state,actual_state,sync_status,last_control_error,updated_at").eq("client_id", profile.client_id).limit(20),
      service.from("client_reports").select("id,report_type,period_start,period_end,title,summary,metrics,insights,generated_at").eq("client_id", profile.client_id).eq("visible_to_client", true).order("generated_at", { ascending: false }).limit(6),
      service.from("business_events").select("id,event_type,event_value,currency,occurred_at").eq("client_id", profile.client_id).order("occurred_at", { ascending: false }).limit(12),
    ]);
    return response.json({ ok: true, portal: portal.data, client: client.data, workflows: workflows.data || [], invoices: invoices.data || [], tasks: tasks.data || [], tickets: tickets.data || [], controls: controls.data || [], reports: reports.data || [], metrics: metrics.data || [] });
  } catch {
    return response.status(503).json({ ok: false, error: "We couldn't load your portal right now. Please try again." });
  }
}


async function updateClientAutomationState(request: Request, response: Response) {
  const raw = readCookie(request, SESSION_COOKIE); const slug = String(request.params.slug || "").toLowerCase(); const workflowId = String(request.params.workflowId || "");
  if (!raw || !slug || !workflowId) return response.status(401).json({ ok: false, error: "Not authenticated." });
  try {
    const session = JSON.parse(raw) as Session; const { data: auth, error: authError } = await createAnonClient().auth.getUser(session.access_token); if (authError || !auth.user) return response.status(401).json({ ok: false, error: "Not authenticated." });
    const service = createServiceClient(); const profile = await profileForUser(service, auth.user.id); if (!profile || profile.role !== "client" || !profile.client_id) return response.status(403).json({ ok: false, error: "Client access required." });
    const portal = await service.from("client_portal_config").select("client_id").eq("client_id", profile.client_id).eq("slug", slug).limit(1).maybeSingle(); if (!portal.data) return response.status(403).json({ ok: false, error: "Portal access denied." });
    const desired = (request.body as { desired_state?: string }).desired_state; if (desired !== "running" && desired !== "paused") return response.status(400).json({ ok: false, error: "Desired state must be running or paused." });
    const workflow = await service.from("workflows").select("id,client_id,n8n_instance_id,actual_state").eq("id", workflowId).eq("client_id", profile.client_id).eq("client_visible", true).limit(1).maybeSingle(); if (!workflow.data) return response.status(404).json({ ok: false, error: "Automation not found." });
    const control = await service.from("client_automation_controls").upsert({ workflow_id: workflowId, client_id: profile.client_id, n8n_instance_id: workflow.data.n8n_instance_id, desired_state: desired, actual_state: workflow.data.actual_state, sync_status: "synchronizing", requested_by_user_id: auth.user.id, requested_at: new Date().toISOString() }, { onConflict: "workflow_id" }).select("id,workflow_id,desired_state,actual_state,sync_status,last_control_error").limit(1).single();
    if (control.error) return response.status(400).json({ ok: false, error: control.error.message });
    await service.from("workflows").update({ desired_state: desired }).eq("id", workflowId).eq("client_id", profile.client_id);
    return response.json({ ok: true, control: control.data, message: "Your request is queued for secure n8n synchronization." });
  } catch { return response.status(503).json({ ok: false, error: "Unable to update automation state right now." }); }
}

async function provisionClient(request: Request, response: Response) {
  const raw = readCookie(request, SESSION_COOKIE);
  if (!raw) return response.status(401).json({ ok: false, error: "Not authenticated." });
  let authUserId: string | null = null;
  let clientId: string | null = null;
  try {
    const session = JSON.parse(raw) as Session;
    const { data: auth, error: authError } = await createAnonClient().auth.getUser(session.access_token);
    if (authError || !auth.user) return response.status(401).json({ ok: false, error: "Not authenticated." });
    const service = createServiceClient();
    const actor = await profileForUser(service, auth.user.id);
    if (!actor || actor.role !== "admin") return response.status(403).json({ ok: false, error: "Administrator access required." });
    const body = request.body as { company_name?: string; contact_name?: string; email?: string; phone?: string; slug?: string; portal_title?: string; client_email?: string; client_password?: string };
    const companyName = body.company_name?.trim(); const clientEmail = body.client_email?.trim().toLowerCase(); const password = body.client_password; const slug = body.slug?.trim().toLowerCase();
    if (!companyName || !clientEmail || !password || !slug || !/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) return response.status(400).json({ ok: false, error: "Company, client email, password, and a valid portal slug are required." });
    const created = await service.from("clients").insert({ company_name: companyName, contact_name: body.contact_name?.trim() || null, email: body.email?.trim().toLowerCase() || clientEmail, phone: body.phone?.trim() || null, status: "pending", created_by_user_id: auth.user.id }).select("id,company_name,email,status").limit(1).single();
    if (created.error || !created.data) return response.status(400).json({ ok: false, error: created.error?.message || "Unable to create client." });
    clientId = created.data.id;
    const createdAuth = await service.auth.admin.createUser({ email: clientEmail, password, email_confirm: true, user_metadata: { company_name: companyName, role: "client" } });
    if (createdAuth.error || !createdAuth.data.user) throw new Error(createdAuth.error?.message || "Unable to create client login.");
    authUserId = createdAuth.data.user.id;
    const profile = await service.from("profiles").insert({ user_id: authUserId, role: "client", client_id: clientId, full_name: body.contact_name?.trim() || companyName }).select("user_id").limit(1).single();
    if (profile.error) throw new Error(profile.error.message);
    const portal = await service.from("client_portal_config").insert({ client_id: clientId, slug, portal_title: body.portal_title?.trim() || `${companyName} Portal` }).select("slug,portal_title").limit(1).single();
    if (portal.error || !portal.data) throw new Error(portal.error?.message || "Unable to create portal.");
    await service.from("audit_logs").insert({ actor_user_id: auth.user.id, actor_role: "admin", client_id: clientId, action: "client.provisioned", table_name: "clients", record_id: clientId, metadata: { slug } });
    return response.status(201).json({ ok: true, client: created.data, portal: portal.data, login_email: clientEmail });
  } catch (error) {
    const service = createServiceClient();
    if (authUserId) await service.auth.admin.deleteUser(authUserId);
    if (clientId) await service.from("clients").delete().eq("id", clientId);
    return response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Unable to provision client." });
  }
}

const adminDataMap: Record<string, { table: string; columns: string }> = {
  clients: { table: "clients", columns: "id,company_name,contact_name,email,status,created_at" }, invoices: { table: "invoices", columns: "id,invoice_number,total_amount,amount_paid,status,due_date" }, workflows: { table: "workflows", columns: "id,workflow_name,status,desired_state,actual_state,last_success_at,last_failure_at" }, n8n_instances: { table: "n8n_instances", columns: "id,instance_name,base_url,hosting_type,status,last_sync_status,last_verified_at" }, calendar_events: { table: "calendar_events", columns: "id,title,event_type,status,starts_at,ends_at,location" }, tasks: { table: "tasks", columns: "id,title,status,priority,due_at,completed_at" }, support_tickets: { table: "support_tickets", columns: "id,ticket_number,subject,status,priority,category,created_at" }, business_events: { table: "business_events", columns: "id,event_type,event_value,currency,occurred_at,created_at" }, audit_logs: { table: "audit_logs", columns: "id,actor_role,action,table_name,record_id,created_at" },
};

async function adminContext(request: Request) {
  const raw = readCookie(request, SESSION_COOKIE);
  if (!raw) return null;
  try { const session = JSON.parse(raw) as Session; const { data, error } = await createAnonClient().auth.getUser(session.access_token); if (error || !data.user) return null; const service = createServiceClient(); const profile = await profileForUser(service, data.user.id); return profile?.role === "admin" ? { service } : null; } catch { return null; }
}

async function adminData(request: Request, response: Response) {
  const context = await adminContext(request); if (!context) return response.status(401).json({ ok: false, error: "Not authenticated." });
  const definition = adminDataMap[String(request.params.resource || "")]; if (!definition) return response.status(404).json({ ok: false, error: "Unknown data resource." });
  const result = await context.service.from(definition.table as never).select(definition.columns).order("created_at", { ascending: false }).limit(50);
  return response.status(result.error ? 400 : 200).json({ ok: !result.error, rows: result.data || [], error: result.error?.message || null });
}

async function adminOverview(request: Request, response: Response) {
  const context = await adminContext(request); if (!context) return response.status(401).json({ ok: false, error: "Not authenticated." }); const service = context.service;
  const [clients, templates, workflows, instances, subscriptions, invoices] = await Promise.all([service.from("clients").select("id,company_name,contact_name,email,status,created_at").order("created_at", { ascending: false }).limit(50), service.from("automation_templates").select("id", { count: "exact", head: true }), service.from("workflows").select("id", { count: "exact", head: true }), service.from("n8n_instances").select("id", { count: "exact", head: true }), service.from("subscriptions").select("monthly_amount,status").eq("status", "active").limit(200), service.from("invoices").select("total_amount,amount_paid,status").in("status", ["due", "partially_paid", "overdue"]).limit(200)]);
  return response.json({ ok: true, clients: clients.data || [], templates: templates.count || 0, workflows: workflows.count || 0, instances: instances.count || 0, mrr: (subscriptions.data || []).reduce((sum, row) => sum + Number(row.monthly_amount || 0), 0), overdue: (invoices.data || []).reduce((sum, row) => sum + Math.max(Number(row.total_amount || 0) - Number(row.amount_paid || 0), 0), 0), error: clients.error?.message || null });
}


const adminWriteMap: Record<string, { table: string; fields: string[] }> = {
  clients: { table: "clients", fields: ["company_name","contact_name","email","phone","status","notes"] },
  subscriptions: { table: "subscriptions", fields: ["client_id","service_name","monthly_amount","currency","billing_day","auto_renew","status","start_date","current_period_start","current_period_end"] },
  invoices: { table: "invoices", fields: ["client_id","subscription_id","invoice_number","invoice_type","issue_date","due_date","period_start","period_end","total_amount","amount_paid","status","description"] },
  payments: { table: "payments", fields: ["client_id","invoice_id","amount","payment_date","method","reference","status","notes"] },
  billing_adjustments: { table: "billing_adjustments", fields: ["client_id","subscription_id","invoice_id","adjustment_type","amount_delta","days_delta","description","applied"] },
  n8n_instances: { table: "n8n_instances", fields: ["instance_name","base_url","hosting_type","status","server_id","n8n_api_secret_ref","metadata"] },
  workflows: { table: "workflows", fields: ["client_id","n8n_instance_id","n8n_workflow_id","workflow_name","business_name","business_job","description","status","client_visible","desired_state","actual_state","config"] },
  tasks: { table: "tasks", fields: ["client_id","title","description","status","priority","due_at","client_visible"] },
  support_tickets: { table: "support_tickets", fields: ["client_id","ticket_number","subject","status","priority","category"] },
  calendar_events: { table: "calendar_events", fields: ["client_id","title","event_type","starts_at","ends_at","location","notes"] },
};

async function adminWrite(request: Request, response: Response) {
  const context = await adminContext(request); if (!context) return response.status(401).json({ ok: false, error: "Not authenticated." });
  const resource=String(request.params.resource||""); const definition=adminWriteMap[resource]; if(!definition) return response.status(404).json({ok:false,error:"This module does not support creation yet."});
  const body=request.body as Record<string, unknown>; const payload: Record<string, unknown>={}; for(const field of definition.fields){ if(body[field] !== undefined && body[field] !== "") payload[field]=body[field]; }
  if(resource==="invoices" && payload.amount_paid===undefined) payload.amount_paid=0; if(resource==="invoices" && payload.status===undefined) payload.status="open"; if(resource==="payments" && payload.status===undefined) payload.status="recorded"; if(resource==="tasks" && payload.status===undefined) payload.status="open"; if(resource==="tasks" && payload.priority===undefined) payload.priority="normal"; if(resource==="support_tickets" && payload.status===undefined) payload.status="open"; if(resource==="support_tickets" && payload.priority===undefined) payload.priority="normal"; if(resource==="workflows" && payload.status===undefined) payload.status="active"; if(resource==="workflows" && payload.desired_state===undefined) payload.desired_state="running"; if(resource==="workflows" && payload.actual_state===undefined) payload.actual_state="unknown"; if(resource==="n8n_instances" && payload.status===undefined) payload.status="pending";
  if(resource==="payments") payload.recorded_by_user_id=(await currentAdminUser(request)) || undefined; if(resource==="billing_adjustments") payload.created_by_user_id=(await currentAdminUser(request)) || undefined; if(resource==="tasks") payload.created_by_user_id=(await currentAdminUser(request)) || undefined; if(resource==="support_tickets") payload.created_by_user_id=(await currentAdminUser(request)) || undefined;
  const result=await context.service.from(definition.table as never).insert(payload).select("*").limit(1).single(); if(result.error) return response.status(400).json({ok:false,error:result.error.message});
  if(resource==="payments" && payload.invoice_id) { const invoice=await context.service.from("invoices").select("id,total_amount,amount_paid").eq("id",String(payload.invoice_id)).limit(1).maybeSingle(); if(invoice.data){const total=Number(invoice.data.total_amount||0), paid=Number(invoice.data.amount_paid||0)+Number(payload.amount||0); await context.service.from("invoices").update({amount_paid:paid,status:paid>=total?"paid":"partially_paid"}).eq("id",invoice.data.id);}}
  const createdId = (result.data as { id?: string } | null)?.id || null;
  await context.service.from("audit_logs").insert({actor_user_id:await currentAdminUser(request),actor_role:"admin",action:resource+".created",table_name:definition.table,record_id:createdId,metadata:{}}); return response.status(201).json({ok:true,row:result.data});
}
async function currentAdminUser(request: Request){ const raw=readCookie(request,SESSION_COOKIE); if(!raw)return null; try{const session=JSON.parse(raw) as Session; const {data}=await createAnonClient().auth.getUser(session.access_token); if(!data.user)return null; const profile=await profileForUser(createServiceClient(),data.user.id); return profile?.role==="admin"?data.user.id:null;}catch{return null;} }
async function updateClientStatus(request: Request,response: Response){const context=await adminContext(request);if(!context)return response.status(401).json({ok:false,error:"Not authenticated."});const status=(request.body as {status?:string}).status;if(!["pending","active","paused","churned","archived"].includes(String(status)))return response.status(400).json({ok:false,error:"Invalid client status."});const result=await context.service.from("clients").update({status}).eq("id",String(request.params.id)).select("id,company_name,status").limit(1).single();if(result.error)return response.status(400).json({ok:false,error:result.error.message});await context.service.from("audit_logs").insert({actor_user_id:await currentAdminUser(request),actor_role:"admin",client_id:request.params.id,action:"client."+status,table_name:"clients",record_id:request.params.id,metadata:{}});return response.json({ok:true,row:result.data});}
async function deleteClient(request: Request,response: Response){const context=await adminContext(request);if(!context)return response.status(401).json({ok:false,error:"Not authenticated."});const clientId=String(request.params.id);const existing=await context.service.from("clients").select("id,company_name").eq("id",clientId).limit(1).maybeSingle();if(existing.error||!existing.data)return response.status(404).json({ok:false,error:"Client not found."});const profiles=await context.service.from("profiles").select("user_id").eq("client_id",clientId).limit(20);const childTables=["support_ticket_messages","support_tickets","calendar_events","tasks","automation_logs","workflow_runs","workflows","client_automation_controls","business_events","client_reports","billing_adjustments","payments","invoices","subscriptions","client_connections","client_onboarding","client_portal_config","credentials"];for(const table of childTables){const result=await context.service.from(table).delete().eq("client_id",clientId);if(result.error)return response.status(400).json({ok:false,error:`Could not remove ${table}: ${result.error.message}`});}const deleted=await context.service.from("clients").delete().eq("id",clientId);if(deleted.error)return response.status(400).json({ok:false,error:deleted.error.message});const actor=await currentAdminUser(request);await context.service.from("audit_logs").insert({actor_user_id:actor,actor_role:"admin",action:"client.deleted",table_name:"clients",record_id:clientId,metadata:{client_id:clientId,company_name:existing.data.company_name}});for(const profile of profiles.data||[]){await context.service.from("profiles").delete().eq("user_id",profile.user_id);await context.service.auth.admin.deleteUser(profile.user_id);}return response.json({ok:true,deleted:clientId});}

export function createApiApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use((_request, response, next) => { response.setHeader("Cache-Control", "no-store"); next(); });
  app.use(express.json({ limit: "16kb" }));
  app.post("/api/auth/admin", adminLogin);
  app.post("/api/auth/client", clientLogin);
  app.get("/api/auth/me", currentSession);
  app.get("/api/auth/client-access/:slug", clientAccess);
  app.get("/api/portal/:slug/summary", portalSummary);
  app.post("/api/admin/clients", provisionClient);
  app.post("/api/portal/:slug/workflows/:workflowId/state", updateClientAutomationState);
  app.get("/api/admin/overview", adminOverview);
  app.get("/api/admin/data/:resource", adminData);
  app.post("/api/admin/data/:resource", adminWrite);
  app.patch("/api/admin/clients/:id/status", updateClientStatus);
  app.delete("/api/admin/clients/:id", deleteClient);
  app.delete("/api/admin/clients/:id", deleteClient);
  app.post("/api/auth/logout", (_request, response) => { clearSession(response); response.json({ ok: true }); });
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
  const server = createServer(createApp());
  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));
  return server;
}

const invokedDirectly = process.argv[1]?.endsWith("dist/index.js") || process.argv[1]?.endsWith("server/index.ts");
if (invokedDirectly && process.env.NODE_ENV !== "test" && !process.env.VITEST) startServer().catch((error) => { console.error("Unable to start VectorOps server", error); process.exitCode = 1; });
