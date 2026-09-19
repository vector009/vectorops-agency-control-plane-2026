import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { N8nControlPlane, safeError, type WorkflowDefinition } from "../_shared/n8n.ts";

type Json = Record<string, unknown>;
type Profile = { user_id: string; role: "admin" | "client"; client_id: string | null; full_name: string | null };
type AuthContext = { profile: Profile; userId: string; slug: string | null; actor: SupabaseClient; service: SupabaseClient };
type Result = { status?: number; body: Json };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PUBLIC_APP_URL = Deno.env.get("PUBLIC_APP_URL") || "";
const ALLOWED_ORIGINS = new Set((Deno.env.get("ALLOWED_ORIGINS") || PUBLIC_APP_URL).split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean));
const MAX_BODY_BYTES = 65_536;
const onboardingStages = ["identity_complete", "portal_complete", "commercial_complete", "infrastructure_complete", "automations_complete", "n8n_complete", "account_complete", "verification_complete", "access_sent"] as const;

if (!SUPABASE_URL || !PUBLISHABLE_KEY || !SERVICE_KEY) throw new Error("Supabase runtime configuration is incomplete");

const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const controlPlane = new N8nControlPlane(service, Number(Deno.env.get("N8N_EXECUTION_SYNC_LIMIT") || 50));

function response(request: Request, result: Result) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'none'",
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(result.body), { status: result.status || 200, headers });
}

function corsAllowed(request: Request) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function routePath(request: Request) {
  const path = new URL(request.url).pathname;
  const marker = path.indexOf("/api/");
  return marker >= 0 ? path.slice(marker) : path.endsWith("/api") ? "/api" : path;
}

async function body(request: Request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new Error("Request body is too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("Request body is too large");
  if (!text) return {} as Json;
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Request body must be a JSON object");
  return value as Json;
}

function bearer(request: Request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function authenticate(request: Request): Promise<AuthContext | null> {
  const token = bearer(request);
  if (!token) return null;
  const anon = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const user = await anon.auth.getUser(token);
  if (user.error || !user.data.user) return null;
  const profileResult = await service.from("profiles").select("user_id,role,client_id,full_name").eq("user_id", user.data.user.id).maybeSingle();
  if (profileResult.error || !profileResult.data) return null;
  const profile = profileResult.data as Profile;
  if (profile.role === "admin" && profile.client_id !== null) return null;
  if (profile.role === "client" && !profile.client_id) return null;
  let slug: string | null = null;
  if (profile.client_id) {
    const [client, portal] = await Promise.all([
      service.from("clients").select("status").eq("id", profile.client_id).single(),
      service.from("client_portal_config").select("slug").eq("client_id", profile.client_id).single(),
    ]);
    if (client.error || portal.error || !portal.data || ["churned", "archived"].includes(client.data?.status)) return null;
    slug = portal.data.slug;
  }
  return { profile, userId: user.data.user.id, slug, actor: anon, service };
}

async function requireAdmin(request: Request) {
  const context = await authenticate(request);
  return context?.profile.role === "admin" && context.profile.client_id === null ? context : null;
}

async function requireClient(request: Request, slug: string) {
  const context = await authenticate(request);
  return context?.profile.role === "client" && context.profile.client_id && context.slug === slug ? context : null;
}

const fail = (status: number, error: string): Result => ({ status, body: { ok: false, error } });
const ok = (body: Json = {}, status = 200): Result => ({ status, body: { ok: true, ...body } });
function text(value: unknown, max: number, required = true) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error("A required value is missing");
    return null;
  }
  if (typeof value !== "string" || value.trim().length > max) throw new Error("A text value is invalid");
  return value.trim();
}
function timestamp(value: unknown, label = "occurred_at") {
  const clean = text(value, 50)!;
  if (Number.isNaN(Date.parse(clean))) throw new Error(`${label} is invalid`);
  return new Date(clean).toISOString();
}
function secretEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let different = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) different |= (a[index % Math.max(a.length, 1)] || 0) ^ (b[index % Math.max(b.length, 1)] || 0);
  return different === 0;
}

async function authMe(request: Request): Promise<Result> {
  const context = await authenticate(request);
  if (!context) return fail(401, "Not authenticated.");
  return ok({ user: { id: context.userId, role: context.profile.role, client_id: context.profile.client_id, slug: context.slug, name: context.profile.full_name || (context.profile.role === "admin" ? "VectorOps Admin" : "Client") } });
}

async function portalSummary(request: Request, slug: string): Promise<Result> {
  const context = await requireClient(request, slug);
  if (!context) return fail(403, "Access denied. You cannot access this client portal.");
  const clientId = context.profile.client_id!;
  const actor = context.actor;
  const queries = await Promise.all([
    actor.from("client_portal_config").select("*").eq("slug", slug).eq("client_id", clientId).maybeSingle(),
    actor.from("clients").select("*").eq("id", clientId).maybeSingle(),
    actor.from("profiles").select("user_id,full_name,phone,created_at,updated_at").eq("user_id", context.userId).maybeSingle(),
    actor.from("subscriptions").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1),
    actor.from("workflows").select("*").eq("client_id", clientId).eq("client_visible", true).order("created_at", { ascending: false }),
    actor.from("workflow_runs").select("id,workflow_id,source_execution_id,started_at,finished_at,status,duration_ms,error_message,created_at").eq("client_id", clientId).eq("client_visible", true).order("started_at", { ascending: false }).limit(250),
    actor.from("invoices").select("*").eq("client_id", clientId).order("due_date", { ascending: false }),
    service.from("payments").select("id,client_id,invoice_id,amount,payment_date,method,reference,status,created_at").eq("client_id", clientId).order("payment_date", { ascending: false }),
    service.from("billing_adjustments").select("id,client_id,subscription_id,invoice_id,adjustment_type,amount_delta,days_delta,description,applied,applied_at,created_at").eq("client_id", clientId).eq("applied", true).order("created_at", { ascending: false }),
    actor.from("tasks").select("*").eq("client_id", clientId).eq("client_visible", true).order("due_at", { ascending: true }),
    actor.from("support_tickets").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
    actor.from("support_ticket_messages").select("id,ticket_id,sender_user_id,message,created_at").eq("client_id", clientId).eq("internal", false).order("created_at", { ascending: true }),
    actor.from("business_events").select("*").eq("client_id", clientId).order("occurred_at", { ascending: false }).limit(500),
    actor.from("client_reports").select("id,report_type,period_start,period_end,title,summary,metrics,insights,generated_at").eq("client_id", clientId).eq("visible_to_client", true).order("period_end", { ascending: false }).limit(50),
  ]);
  const failed = queries.find((query) => query.error);
  if (failed?.error) throw failed.error;
  const [portal, client, profile, subscriptions, workflows, runs, invoices, payments, adjustments, tasks, tickets, messages, metrics, reports] = queries;
  if (!portal.data || !client.data) return fail(404, "Portal not found.");
  return ok({ portal: portal.data, client: client.data, profile: profile.data, subscription: subscriptions.data?.[0] || null, workflows: workflows.data || [], workflowRuns: runs.data || [], invoices: invoices.data || [], payments: payments.data || [], adjustments: adjustments.data || [], tasks: tasks.data || [], tickets: (tickets.data || []).map((ticket: Json) => ({ ...ticket, description: (messages.data || []).find((message: Json) => message.ticket_id === ticket.id)?.message || "No message supplied.", messages: (messages.data || []).filter((message: Json) => message.ticket_id === ticket.id) })), metrics: metrics.data || [], reports: reports.data || [] });
}

async function clientMutation(request: Request, slug: string, path: string[], payload: Json): Promise<Result> {
  const context = await requireClient(request, slug);
  if (!context) return fail(403, "Access denied.");
  if (path[0] === "workflows" && path[2] === "state") {
    const desired = payload.desired_state;
    if (!['running', 'paused'].includes(String(desired))) return fail(400, "Desired state must be running or paused.");
    const result = await context.actor.rpc("request_automation_control", { p_workflow_id: path[1], p_desired_state: desired, p_reason: "Client portal request" });
    if (result.error) throw result.error;
    return ok({ control: result.data, message: "Control request queued for secure automation synchronization." });
  }
  if (path[0] === "tickets" && path.length === 1) {
    const subject = text(payload.subject, 200);
    const message = text(payload.description, 5000);
    const category = text(payload.category, 100, false) || "general";
    const priority = payload.priority === "medium" ? "normal" : String(payload.priority || "normal");
    if (!['low', 'normal', 'high', 'urgent'].includes(priority)) return fail(400, "Invalid ticket priority.");
    const result = await context.actor.rpc("create_client_ticket", { p_subject: subject, p_message: message, p_category: category, p_priority: priority });
    if (result.error) throw result.error;
    return ok({ ticket: { ...(result.data as Json), description: message } }, 201);
  }
  if (path[0] === "tickets" && path[2] === "messages") {
    const message = text(payload.message, 5000);
    const result = await context.actor.rpc("add_client_ticket_message", { p_ticket_id: path[1], p_message: message });
    if (result.error) throw result.error;
    return ok({ message: result.data }, 201);
  }
  if (path[0] === "profile") {
    const fullName = text(payload.full_name, 120);
    const phone = text(payload.phone, 40, false);
    const result = await context.actor.from("profiles").update({ full_name: fullName, phone }).eq("user_id", context.userId).select("user_id,full_name,phone,created_at,updated_at").single();
    if (result.error) throw result.error;
    return ok({ profile: result.data });
  }
  return fail(404, "Unknown client operation.");
}

const resources = new Set(["clients", "client_portal_config", "subscriptions", "invoices", "payments", "billing_adjustments", "workflows", "discovered_workflows", "automation_templates", "n8n_instances", "provider_balances", "credentials", "tasks", "support_tickets", "calendar_events", "business_events", "audit_logs", "workflow_runs", "automation_logs", "client_onboarding", "client_reports"]);

async function adminData(request: Request, resource: string): Promise<Result> {
  const context = await requireAdmin(request);
  if (!context) return fail(401, "Not authenticated as administrator.");
  if (!resources.has(resource)) return fail(404, `Unknown resource: ${resource}`);
  if (resource === "support_tickets") {
    const [tickets, messages] = await Promise.all([service.from("support_tickets").select("*").order("updated_at", { ascending: false }), service.from("support_ticket_messages").select("id,ticket_id,sender_user_id,message,internal,created_at").order("created_at", { ascending: true })]);
    if (tickets.error || messages.error) throw tickets.error || messages.error;
    return ok({ rows: (tickets.data || []).map((ticket: Json) => { const related = (messages.data || []).filter((message: Json) => message.ticket_id === ticket.id); return { ...ticket, description: related.find((message: Json) => !message.internal)?.message || "No client message supplied.", internal_notes: related.filter((message: Json) => message.internal).map((message: Json) => message.message).join("\n\n"), messages: related.filter((message: Json) => !message.internal).map(({ internal: _internal, ...message }: Json) => message) }; }) });
  }
  if (resource === "workflows") {
    const [workflows, controls] = await Promise.all([service.from("workflows").select("*").order("updated_at", { ascending: false }), service.from("client_automation_controls").select("workflow_id,sync_status")]);
    if (workflows.error || controls.error) throw workflows.error || controls.error;
    const state = new Map((controls.data || []).map((item: Json) => [item.workflow_id, item.sync_status]));
    return ok({ rows: (workflows.data || []).map((item: Json) => ({ ...item, sync_status: state.get(item.id) || (item.desired_state === item.actual_state ? "success" : "pending") })) });
  }
  const result = await service.from(resource).select("*").order("created_at", { ascending: false });
  if (result.error) throw result.error;
  let rows = (result.data || []) as Json[];
  if (resource === "discovered_workflows") rows = rows.map((row) => ({ ...row, name_in_n8n: row.discovered_name || row.n8n_workflow_id, discovered_at: row.first_seen_at }));
  if (resource === "automation_templates") rows = rows.map((row) => ({ ...row, version: "1.0", target_industry: (row.default_config as Json)?.target_industry || "All industries", n8n_template_json_ref: row.n8n_template_ref }));
  if (resource === "subscriptions") rows = rows.map((row) => ({ ...row, next_billing_date: row.current_period_end ? String(row.current_period_end).slice(0, 10) : null }));
  if (resource === "provider_balances") rows = rows.map((row) => ({ ...row, provider: row.provider_name, category: row.account_name || "Provider account", current_balance: row.balance, alert_threshold: row.threshold, last_checked_at: row.checked_at, status: Number(row.balance) <= Number(row.threshold) ? "low_balance" : "healthy" }));
  if (resource === "credentials") rows = rows.map((row) => ({ ...row, service_name: row.credential_name, status: row.active ? (row.expires_at && Date.parse(String(row.expires_at)) < Date.now() ? "expired" : "active") : "expired", last_used_at: row.updated_at }));
  return ok({ rows });
}

async function overview(request: Request): Promise<Result> {
  const context = await requireAdmin(request);
  if (!context) return fail(401, "Not authenticated as administrator.");
  const [clientsR, subscriptionsR, invoicesR, paymentsR, workflowsR, instancesR, ticketsR, templatesR] = await Promise.all([
    service.from("clients").select("*"), service.from("subscriptions").select("*"), service.from("invoices").select("*"), service.from("payments").select("*"), service.from("workflows").select("*"), service.from("n8n_instances").select("*"), service.from("support_tickets").select("*"), service.from("automation_templates").select("id", { count: "exact", head: true }),
  ]);
  const error = [clientsR, subscriptionsR, invoicesR, paymentsR, workflowsR, instancesR, ticketsR, templatesR].find((item) => item.error)?.error;
  if (error) throw error;
  const clients = clientsR.data || []; const subscriptions = subscriptionsR.data || []; const invoices = invoicesR.data || []; const payments = paymentsR.data || []; const workflows = workflowsR.data || []; const instances = instancesR.data || []; const tickets = ticketsR.data || [];
  const names = new Map(clients.map((client: Json) => [client.id, client.company_name]));
  const currencies = new Map(subscriptions.map((subscription: Json) => [subscription.client_id, subscription.currency || "USD"]));
  const financialByCurrency: Record<string, { mrr: number; outstanding: number; collected: number }> = {};
  const bucket = (clientId: unknown) => financialByCurrency[String(currencies.get(clientId) || "USD")] ||= { mrr: 0, outstanding: 0, collected: 0 };
  subscriptions.filter((item: Json) => item.status === "active").forEach((item: Json) => bucket(item.client_id).mrr += Number(item.monthly_amount || 0));
  invoices.filter((item: Json) => !["paid", "void"].includes(String(item.status))).forEach((item: Json) => bucket(item.client_id).outstanding += Math.max(0, Number(item.total_amount) - Number(item.amount_paid)));
  payments.filter((item: Json) => item.status === "received").forEach((item: Json) => bucket(item.client_id).collected += Number(item.amount || 0));
  const attentionItems = [
    ...invoices.filter((item: Json) => ["partially_paid", "overdue"].includes(String(item.status))).map((item: Json) => ({ id: `invoice-${item.id}`, tone: "amber", title: `${item.status === "overdue" ? "Overdue" : "Partial"} balance · ${names.get(item.client_id) || "Client"}`, subtitle: `${item.invoice_number} has ${Math.max(0, Number(item.total_amount) - Number(item.amount_paid)).toFixed(2)} outstanding.`, actionLabel: "Review billing", targetModule: "Money" })),
    ...tickets.filter((item: Json) => !["resolved", "closed"].includes(String(item.status))).map((item: Json) => ({ id: `ticket-${item.id}`, tone: "purple", title: `Support waiting · ${item.ticket_number}`, subtitle: `${names.get(item.client_id) || "Client"}: ${item.subject}`, actionLabel: "Open ticket", targetModule: "Support" })),
  ].slice(0, 12);
  const outstanding = invoices.filter((item: Json) => !["paid", "void"].includes(String(item.status))).reduce((sum: number, item: Json) => sum + Math.max(0, Number(item.total_amount) - Number(item.amount_paid)), 0);
  return ok({ clients, templates: templatesR.count || 0, workflows: workflows.filter((item: Json) => item.status === "active").length, instances: instances.filter((item: Json) => item.status === "active").length, mrr: subscriptions.filter((item: Json) => item.status === "active").reduce((sum: number, item: Json) => sum + Number(item.monthly_amount), 0), overdue: outstanding, collected: payments.filter((item: Json) => item.status === "received").reduce((sum: number, item: Json) => sum + Number(item.amount), 0), financialByCurrency, healthPercent: workflows.length ? Math.round(workflows.filter((item: Json) => item.status !== "error" && item.actual_state !== "unknown" && item.desired_state === item.actual_state).length / workflows.length * 1000) / 10 : 100, openTickets: tickets.filter((item: Json) => !["resolved", "closed"].includes(String(item.status))).length, attentionItems });
}

async function adminWrite(request: Request, resource: string, payload: Json): Promise<Result> {
  const context = await requireAdmin(request);
  if (!context) return fail(401, "Not authenticated.");
  if (resource === "payments") {
    const amount = Number(payload.amount);
    if (!payload.invoice_id || !Number.isFinite(amount) || amount <= 0) return fail(400, "A valid invoice and positive payment amount are required.");
    const payment = await context.actor.rpc("mark_payment_received", { p_invoice_id: String(payload.invoice_id), p_amount: amount, p_method: payload.method ? String(payload.method) : null, p_reference: payload.reference ? String(payload.reference) : null, p_notes: payload.notes ? String(payload.notes) : null });
    if (payment.error) throw payment.error;
    const invoice = await service.from("invoices").select("*").eq("id", String(payload.invoice_id)).single();
    if (invoice.error) throw invoice.error;
    return ok({ row: payment.data, invoice: invoice.data }, 201);
  }
  if (resource === "billing_adjustments") {
    if (!payload.client_id || (!payload.subscription_id && !payload.invoice_id)) return fail(400, "A client and billing target are required.");
    const result = await context.actor.rpc("apply_billing_adjustment", { p_client_id: String(payload.client_id), p_adjustment_type: String(payload.adjustment_type || ""), p_amount_delta: Number(payload.amount_delta || 0), p_days_delta: Number(payload.days_delta || 0), p_subscription_id: payload.subscription_id ? String(payload.subscription_id) : null, p_invoice_id: payload.invoice_id ? String(payload.invoice_id) : null, p_description: payload.description ? String(payload.description) : null });
    if (result.error) throw result.error;
    return ok({ row: result.data }, 201);
  }
  if (resource === "tasks") {
    const title = text(payload.title, 200);
    const result = await service.from("tasks").insert({ client_id: payload.client_id ? String(payload.client_id) : null, title, description: text(payload.description, 5000, false), status: payload.status || "todo", priority: payload.priority || "medium", due_at: payload.due_at ? timestamp(payload.due_at, "due_at") : null, created_by_user_id: context.userId }).select("*").single();
    if (result.error) throw result.error;
    return ok({ row: result.data }, 201);
  }
  if (resource === "calendar_events") {
    const aliases: Record<string, string> = { invoice_due: "internal", payment: "internal", adjustment: "internal", task: "internal", support_followup: "call", maintenance: "internal" };
    const start = timestamp(payload.starts_at, "starts_at");
    const end = payload.ends_at ? timestamp(payload.ends_at, "ends_at") : null;
    if (end && Date.parse(end) < Date.parse(start)) return fail(400, "Event end must follow its start.");
    const result = await service.from("calendar_events").insert({ client_id: payload.client_id ? String(payload.client_id) : null, title: text(payload.title, 200), description: text(payload.notes, 5000, false), event_type: aliases[String(payload.event_type)] || String(payload.event_type || "other"), starts_at: start, ends_at: end, location: text(payload.location, 300, false), created_by_user_id: context.userId }).select("*").single();
    if (result.error) throw result.error;
    return ok({ row: { ...result.data, notes: result.data.description } }, 201);
  }
  return fail(400, `Writing to ${resource} is not supported by this endpoint.`);
}

async function adminMutation(request: Request, path: string[], payload: Json): Promise<Result> {
  const context = await requireAdmin(request);
  if (!context) return fail(401, "Not authenticated.");
  if (path[0] === "clients" && path.length === 1 || path[0] === "onboarding" && path.length === 1) return onboard(context, payload);
  if (path[0] === "clients" && path[2] === "status") {
    const status = String(payload.status || "");
    if (status === "churned" || status === "active") {
      const result = await context.actor.rpc(status === "churned" ? "churn_client" : "reactivate_client", status === "churned" ? { p_client_id: path[1] } : { p_client_id: path[1], p_subscription_id: null });
      if (result.error) throw result.error;
      return ok({ client: result.data });
    }
    if (!["pending", "paused", "archived"].includes(status)) return fail(400, "Invalid client status transition.");
    const result = await service.from("clients").update({ status }).eq("id", path[1]).select("*").single();
    if (result.error) throw result.error;
    return ok({ client: result.data });
  }
  if (path[0] === "clients" && path[2] === "onboarding") return updateOnboarding(context, path[1], payload);
  if (path[0] === "clients" && path[2] === "portal-config") return updatePortal(context, path[1], payload);
  if (path[0] === "workflows" && path[2] === "state") {
    const desired = String(payload.desired_state || "");
    if (!["running", "paused"].includes(desired)) return fail(400, "Desired state must be running or paused.");
    const workflow = await service.from("workflows").select("id,client_id,n8n_instance_id,actual_state").eq("id", path[1]).single();
    if (workflow.error) throw workflow.error;
    const control = await service.from("client_automation_controls").upsert({ workflow_id: path[1], client_id: workflow.data.client_id, n8n_instance_id: workflow.data.n8n_instance_id, desired_state: desired, actual_state: workflow.data.actual_state, sync_status: "pending", requested_by_user_id: context.userId, requested_at: new Date().toISOString(), last_control_error: null }, { onConflict: "workflow_id" }).select("*").single();
    if (control.error) throw control.error;
    const updated = await service.from("workflows").update({ desired_state: desired }).eq("id", path[1]).select("*").single();
    if (updated.error) throw updated.error;
    return ok({ workflow: { ...updated.data, sync_status: control.data.sync_status } });
  }
  if (path[0] === "workflows" && path[1] === "map") {
    const discovered = await service.from("discovered_workflows").select("n8n_instance_id").eq("id", String(payload.discovered_id)).single();
    if (discovered.error) throw discovered.error;
    const connection = await service.from("client_connections").select("id").eq("client_id", String(payload.client_id)).eq("n8n_instance_id", discovered.data.n8n_instance_id).in("status", ["pending", "connected"]).limit(1).maybeSingle();
    if (connection.error || !connection.data) return fail(409, "Connect this client to the workflow's n8n instance before mapping it.");
    const result = await context.actor.rpc("assign_discovered_workflow", { p_discovered_id: String(payload.discovered_id), p_client_id: String(payload.client_id), p_connection_id: connection.data.id, p_template_id: null, p_business_name: text(payload.business_name, 200), p_business_job: text(payload.business_job, 200), p_description: null });
    if (result.error) throw result.error;
    return ok({ workflow: result.data });
  }
  if (path[0] === "tasks") {
    const status = String(payload.status || "");
    if (!["todo", "in_progress", "blocked", "completed", "cancelled"].includes(status)) return fail(400, "Invalid task status.");
    const result = await service.from("tasks").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", path[1]).select("*").single();
    if (result.error) throw result.error;
    return ok({ task: result.data });
  }
  if (path[0] === "support-tickets" && path[2] === "messages") return adminReply(context, path[1], payload);
  if (path[0] === "support-tickets") return updateTicket(context, path[1], payload);
  if (path[0] === "n8n-instances" && path[2] === "verify") {
    const result = await controlPlane.run(path[1]); const item = result.results[0];
    return item?.ok ? ok({ status: "verified", result: item }) : fail(502, item?.error || "n8n synchronization failed.");
  }
  if (path[0] === "n8n-instances" && path[2] === "credentials" && request.method === "POST") {
    const apiKey = text(payload.api_key, 500);
    const stored = await service.rpc("set_n8n_api_secret", { p_instance_id: path[1], p_api_secret: apiKey });
    if (stored.error) throw stored.error;

    // Do not report success until the supplied key has been used against the
    // real n8n instance and the resulting state has been persisted.
    const result = await controlPlane.run(path[1]);
    const item = result.results[0];
    if (!item?.ok) return fail(502, item?.error || "The API key was stored, but n8n verification failed.");
    return ok({ status: "verified", result: item });
  }
  if (path[0] === "n8n" && path[1] === "sync") {
    const result = await controlPlane.run();
    return { status: result.ok ? 200 : 502, body: result as unknown as Json };
  }
  if (path[0] === "automation-templates" && path[2] === "deploy") return deployTemplate(context, path[1], payload);
  return fail(404, "Unknown administrator operation.");
}

async function onboard(context: AuthContext, payload: Json): Promise<Result> {
  const email = String(payload.email || "").trim().toLowerCase(); const password = String(payload.client_password || ""); const company = String(payload.company_name || "").trim(); const slug = String(payload.slug || "").trim().toLowerCase();
  if (!company || company.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, "Company name and a valid client email are required.");
  if (password.length < 12 || password.length > 128) return fail(400, "Initial client password must contain 12-128 characters.");
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) return fail(400, "Portal slug must be 3-64 lowercase letters, numbers, or hyphens.");
  const auth = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: "client", full_name: String(payload.contact_name || company).trim() } });
  if (auth.error || !auth.data.user) throw auth.error || new Error("Unable to create client authentication account.");
  const safe: Json = { ...payload, company_name: company, email, slug }; delete safe.client_password;
  const result = await context.actor.rpc("admin_onboard_client", { p_payload: safe, p_auth_user_id: auth.data.user.id });
  if (result.error) { await service.auth.admin.deleteUser(auth.data.user.id); throw result.error; }
  return ok(result.data as Json, 201);
}

async function updateOnboarding(context: AuthContext, clientId: string, payload: Json): Promise<Result> {
  const stage = String(payload.stage || "") as typeof onboardingStages[number]; const complete = payload.complete;
  if (!onboardingStages.includes(stage) || typeof complete !== "boolean") return fail(400, "A valid onboarding stage and completion state are required.");
  if (complete && stage === "automations_complete") { const rows = await service.from("workflows").select("id", { count: "exact", head: true }).eq("client_id", clientId); if (!rows.count) return fail(409, "Map or deploy at least one workflow first."); }
  if (complete && ["n8n_complete", "verification_complete"].includes(stage)) { const connection = await service.from("client_connections").select("n8n_instance_id,status").eq("client_id", clientId).eq("status", "connected").limit(1).maybeSingle(); if (!connection.data) return fail(409, "A connected n8n client connection is required."); if (stage === "verification_complete") { const instance = await service.from("n8n_instances").select("status,last_sync_status").eq("id", connection.data.n8n_instance_id).single(); if (instance.data?.status !== "active" || instance.data?.last_sync_status !== "success") return fail(409, "Run a successful n8n verification and telemetry sync first."); } }
  const existing = await service.from("client_onboarding").select("*").eq("client_id", clientId).single(); if (!existing.data) return fail(404, "Onboarding record not found.");
  const next = { ...existing.data, [stage]: complete } as Json; const finished = onboardingStages.every((key) => next[key] === true);
  const result = await context.actor.from("client_onboarding").update({ [stage]: complete, completed_at: finished ? new Date().toISOString() : null }).eq("client_id", clientId).select("*").single(); if (result.error) throw result.error;
  return ok({ onboarding: result.data });
}

async function updatePortal(_context: AuthContext, clientId: string, payload: Json): Promise<Result> {
  const slug = String(payload.slug || "").trim().toLowerCase(); const title = String(payload.portal_title || "").trim(); const primary = String(payload.primary_color || ""); const accent = String(payload.accent_color || "");
  const modules = Array.isArray(payload.enabled_modules) ? [...new Set(payload.enabled_modules.map((item) => String(item).toLowerCase()))] : [];
  const allowed = new Set(["overview", "automations", "results", "billing", "support", "profile"]);
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug) || !title || title.length > 120 || !/^#[0-9a-f]{6}$/i.test(primary) || !/^#[0-9a-f]{6}$/i.test(accent) || !modules.length || modules.some((item) => !allowed.has(item))) return fail(400, "Portal identity, colors, and modules are invalid.");
  for (const url of [payload.logo_url, payload.favicon_url].filter(Boolean)) { const parsed = new URL(String(url)); if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return fail(400, "Brand asset URLs must use HTTP or HTTPS without credentials."); }
  for (const value of [payload.dashboard_config, payload.kpi_config, payload.terminology, payload.client_settings_schema]) if (JSON.stringify(value || {}).length > 20_000) return fail(400, "Portal configuration is too large.");
  const result = await service.from("client_portal_config").update({ slug, portal_title: title, logo_url: payload.logo_url || null, favicon_url: payload.favicon_url || null, primary_color: primary, accent_color: accent, enabled_modules: modules, dashboard_config: payload.dashboard_config || {}, kpi_config: payload.kpi_config || [], terminology: payload.terminology || {}, client_settings_schema: payload.client_settings_schema || {} }).eq("client_id", clientId).select("*").single();
  if (result.error) throw result.error; return ok({ portal: result.data });
}

async function updateTicket(context: AuthContext, id: string, payload: Json): Promise<Result> {
  const status = String(payload.status || ""); const priority = payload.priority ? String(payload.priority) : null; const notes = String(payload.internal_notes || "").trim();
  if (!["open", "pending_client", "pending_admin", "resolved", "closed"].includes(status) || priority && !["low", "normal", "high", "urgent"].includes(priority)) return fail(400, "Invalid ticket status or priority.");
  const ticket = await service.from("support_tickets").select("client_id").eq("id", id).single(); if (ticket.error) throw ticket.error;
  const result = await service.from("support_tickets").update({ status, ...(priority ? { priority } : {}), ...(payload.assign_to_me === true ? { assigned_to_user_id: context.userId } : {}), resolved_at: ["resolved", "closed"].includes(status) ? new Date().toISOString() : null }).eq("id", id).select("*").single(); if (result.error) throw result.error;
  if (notes) { const last = await service.from("support_ticket_messages").select("message").eq("ticket_id", id).eq("internal", true).order("created_at", { ascending: false }).limit(1).maybeSingle(); if (last.data?.message !== notes) { const added = await service.from("support_ticket_messages").insert({ ticket_id: id, client_id: ticket.data.client_id, sender_user_id: context.userId, message: notes, internal: true }); if (added.error) throw added.error; } }
  return ok({ ticket: { ...result.data, internal_notes: notes } });
}

async function adminReply(context: AuthContext, id: string, payload: Json): Promise<Result> {
  const message = text(payload.message, 5000); const ticket = await service.from("support_tickets").select("id,client_id,status").eq("id", id).single();
  if (!ticket.data) return fail(404, "Ticket not found."); if (ticket.data.status === "closed") return fail(400, "Closed tickets cannot receive replies.");
  const result = await service.from("support_ticket_messages").insert({ ticket_id: id, client_id: ticket.data.client_id, sender_user_id: context.userId, message, internal: false }).select("id,ticket_id,sender_user_id,message,created_at").single(); if (result.error) throw result.error;
  await service.from("support_tickets").update({ status: "pending_client" }).eq("id", id); return ok({ message: result.data, status: "pending_client" }, 201);
}

async function deployTemplate(context: AuthContext, templateId: string, payload: Json): Promise<Result> {
  const clientId = String(payload.client_id || ""); const instanceId = String(payload.n8n_instance_id || ""); if (!clientId || !instanceId) return fail(400, "Client, template, and n8n instance are required.");
  const [client, template, connection] = await Promise.all([service.from("clients").select("id,company_name").eq("id", clientId).single(), service.from("automation_templates").select("id,name,default_config,active").eq("id", templateId).eq("active", true).single(), service.from("client_connections").select("id,status").eq("client_id", clientId).eq("n8n_instance_id", instanceId).eq("status", "connected").single()]);
  if (!client.data || !template.data || !connection.data) return fail(409, "A valid client, active template, and verified n8n connection are required.");
  const definition = (template.data.default_config as Json)?.workflow_definition as Partial<WorkflowDefinition> | undefined;
  if (!definition || !Array.isArray(definition.nodes) || !definition.connections || typeof definition.connections !== "object") return fail(422, "This template has no complete deployable n8n workflow definition.");
  const deployed = await controlPlane.deploy(instanceId, { name: `${client.data.company_name} — ${template.data.name}`, nodes: definition.nodes, connections: definition.connections, settings: definition.settings || {} });
  const discovered = await service.rpc("upsert_discovered_workflow", { p_instance_id: instanceId, p_n8n_workflow_id: String(deployed.id), p_discovered_name: deployed.name, p_n8n_active: deployed.active === true, p_payload: { deployment_source: "automation_template", template_id: templateId } }); if (!discovered.data) throw discovered.error || new Error("Unable to register deployed workflow");
  const assigned = await context.actor.rpc("assign_discovered_workflow", { p_discovered_id: discovered.data.id, p_client_id: clientId, p_connection_id: connection.data.id, p_template_id: templateId, p_business_name: template.data.name, p_business_job: template.data.name, p_description: null }); if (assigned.error) throw assigned.error;
  return ok({ workflow: assigned.data, active: deployed.active === true }, 201);
}

async function ingestEvents(request: Request, payload: Json): Promise<Result> {
  const configured = Deno.env.get("N8N_EVENT_INGEST_SECRET") || "";
  const supplied = request.headers.get("x-vectorops-ingest-secret") || bearer(request);
  if (!configured || !supplied || !secretEqual(configured, supplied)) return fail(401, "Invalid integration credentials.");
  const events = Array.isArray(payload.events) ? payload.events : [payload]; if (!events.length || events.length > 100) return fail(400, "Submit between 1 and 100 events.");
  let accepted = 0;
  for (const raw of events as Json[]) {
    const instanceId = text(raw.instance_id, 64)!; const remoteId = text(raw.n8n_workflow_id, 255)!; const sourceKey = text(raw.source_event_key, 255)!; const sourceExecution = text(raw.source_execution_id, 255, false); const eventType = text(raw.event_type, 100)!; const occurred = timestamp(raw.occurred_at); const data = raw.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload) ? raw.payload : {};
    const workflow = await service.from("workflows").select("id,client_id,n8n_instance_id,n8n_workflow_id,client_visible").eq("n8n_instance_id", instanceId).eq("n8n_workflow_id", remoteId).single(); if (!workflow.data) throw new Error("Mapped workflow was not found");
    if (raw.kind === "business") {
      const value = raw.event_value === null || raw.event_value === undefined ? null : Number(raw.event_value); if (value !== null && !Number.isFinite(value)) throw new Error("event_value is invalid");
      const result = await service.rpc("ingest_business_event", { p_client_id: workflow.data.client_id, p_n8n_instance_id: instanceId, p_workflow_id: workflow.data.id, p_event_type: eventType, p_event_value: value, p_currency: raw.currency ? text(raw.currency, 3)!.toUpperCase() : null, p_occurred_at: occurred, p_source_execution_id: sourceExecution, p_source_event_key: sourceKey, p_payload: data }); if (result.error) throw result.error;
    } else if (raw.kind === "automation") {
      const duration = raw.duration_ms === null || raw.duration_ms === undefined ? null : Number(raw.duration_ms); if (duration !== null && (!Number.isSafeInteger(duration) || duration < 0)) throw new Error("duration_ms is invalid");
      const errorMessage = text(raw.error_message, 500, false); const visible = typeof raw.client_visible === "boolean" ? raw.client_visible : workflow.data.client_visible;
      const result = await service.rpc("ingest_automation_event", { p_client_id: workflow.data.client_id, p_n8n_instance_id: instanceId, p_workflow_id: workflow.data.id, p_source_execution_id: sourceExecution, p_source_event_key: sourceKey, p_event_type: eventType, p_severity: text(raw.severity, 30, false) || "info", p_occurred_at: occurred, p_success: typeof raw.success === "boolean" ? raw.success : null, p_duration_ms: duration, p_error_code: text(raw.error_code, 100, false), p_error_message: errorMessage, p_client_visible: visible, p_payload: data }); if (result.error) throw result.error;
      if (sourceExecution) { const run = await service.rpc("record_workflow_run", { p_workflow_id: workflow.data.id, p_source_execution_id: sourceExecution, p_started_at: raw.started_at ? timestamp(raw.started_at, "started_at") : occurred, p_finished_at: raw.finished_at ? timestamp(raw.finished_at, "finished_at") : occurred, p_status: text(raw.status, 50, false) || (raw.success === true ? "success" : raw.success === false ? "error" : eventType), p_duration_ms: duration, p_error_message: errorMessage, p_client_visible: visible, p_payload: data }); if (run.error) throw run.error; }
    } else throw new Error("kind must be business or automation");
    accepted++;
  }
  return ok({ accepted }, 202);
}

async function dispatch(request: Request): Promise<Result> {
  const method = request.method; const path = routePath(request); const parts = path.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent); const payload = ["POST", "PUT", "PATCH"].includes(method) ? await body(request) : {};
  if (path === "/api/health" && method === "GET") { const check = await service.from("profiles").select("user_id").limit(1); return check.error ? fail(503, "Database unavailable.") : ok({ status: "ready", database: "connected", runtime: "supabase-edge" }); }
  if (parts[0] === "auth" && ["me", "session", "user"].includes(parts[1]) && method === "GET") return authMe(request);
  if (parts[0] === "auth" && parts[1] === "logout" || parts[0] === "portal" && parts[1] === "logout") return ok();
  if (parts[0] === "portal" && parts.length >= 3) {
    const slug = parts[1].toLowerCase();
    if (method === "GET" && ["data", "summary"].includes(parts[2])) return portalSummary(request, slug);
    if (!["POST", "PATCH"].includes(method)) return fail(405, "Method not allowed.");
    return clientMutation(request, slug, parts.slice(2), payload);
  }
  if (parts[0] === "admin") {
    if (method === "GET" && parts[1] === "overview") return overview(request);
    if (method === "GET" && parts[1] === "data" && parts[2]) return adminData(request, parts[2]);
    if (method === "POST" && parts[1] === "data" && parts[2]) return adminWrite(request, parts[2], payload);
    if (!["POST", "PATCH"].includes(method)) return fail(405, "Method not allowed.");
    return adminMutation(request, parts.slice(1), payload);
  }
  if (parts[0] === "integrations" && parts[1] === "n8n" && parts[2] === "events" && method === "POST") return ingestEvents(request, payload);
  if (parts[0] === "internal" && parts[1] === "n8n" && parts[2] === "sync" && method === "POST") {
    const configured = Deno.env.get("N8N_CRON_SECRET") || ""; const supplied = request.headers.get("x-vectorops-cron-secret") || "";
    if (!configured || !secretEqual(configured, supplied)) return fail(401, "Invalid scheduler credentials.");
    const instanceId = payload.instance_id ? text(payload.instance_id, 64)! : undefined;
    const result = await controlPlane.run(instanceId); return { status: result.ok ? 200 : 502, body: result as unknown as Json };
  }
  return fail(404, "Route not found.");
}

Deno.serve(async (request) => {
  if (!corsAllowed(request)) return response(request, fail(403, "Request origin is not allowed."));
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin")?.replace(/\/$/, "");
    return new Response(null, { status: 204, headers: { ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}), "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-vectorops-cron-secret, x-vectorops-ingest-secret", "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS", "Access-Control-Max-Age": "86400" } });
  }
  try { return response(request, await dispatch(request)); }
  catch (error) { console.error("VectorOps Edge request failed", safeError(error)); return response(request, fail(400, error instanceof SyntaxError ? "Request body is invalid JSON." : safeError(error))); }
});
