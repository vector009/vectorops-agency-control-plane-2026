import { useState, useEffect, useMemo, type CSSProperties } from "react";
import { useRoute } from "wouter";
import {
  ShieldCheck,
  Zap,
  CircleDollarSign,
  Ticket,
  CheckCircle2,
  Lock,
  LogOut,
  Send,
  Plus,
  X,
  CreditCard,
  Play,
  Pause,
  Clock,
  ArrowUpRight,
  BarChart3,
  UserCircle,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { BillingAdjustment, BusinessEvent, Client, ClientPortalConfig, ClientProfile, ClientReport, Invoice, Payment, Subscription, Workflow, WorkflowRun, SupportTicket, Task } from "@/types/vectorops";
import { edgeApiUrl } from "@/lib/supabase";
import { apiFetch as fetch, signInForRole, signOut } from "@/lib/api";

export function ClientPortal() {
  const [, params] = useRoute("/portal/:slug");
  const slug = params?.slug || "";

  const [portalData, setPortalData] = useState<{
    portal: ClientPortalConfig;
    client: Client;
    profile: ClientProfile | null;
    subscription: Subscription | null;
    invoices: Invoice[];
    payments: Payment[];
    adjustments: BillingAdjustment[];
    workflows: Workflow[];
    workflowRuns: WorkflowRun[];
    tickets: SupportTicket[];
    tasks: Task[];
    metrics: BusinessEvent[];
    reports: ClientReport[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "automations" | "results" | "invoices" | "support" | "profile">("overview");
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [ticketReply, setTicketReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Support modal
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketCategory, setTicketCategory] = useState("automation_issue");
  const [ticketPriority, setTicketPriority] = useState<SupportTicket["priority"]>("normal");
  const [ticketDesc, setTicketDesc] = useState("");
  const [submittingTicket, setSubmittingTicket] = useState(false);

  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: portalData?.subscription?.currency || "USD", maximumFractionDigits: 0 });

  const checkPortalSession = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/portal/${slug}/data`, { credentials: "include" });
      const body = await res.json();
      if (body.ok) {
        setPortalData(body);
        setAuthenticated(true);
      } else {
        setAuthenticated(false);
      }
    } catch {
      setAuthenticated(false);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (slug) checkPortalSession();
  }, [slug]);

  useEffect(() => {
    if (!slug || !authenticated) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void checkPortalSession(true);
    };
    const interval = window.setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [slug, authenticated]);

  useEffect(() => {
    if (!portalData) return;
    const enabled = new Set((portalData.portal.enabled_modules || []).map((module) => module.toLowerCase()));
    const isEnabled = (tab: typeof activeTab) => tab === "overview"
      ? enabled.has("overview")
      : tab === "invoices"
        ? enabled.has("billing") || enabled.has("invoices")
        : enabled.has(tab);
    if (isEnabled(activeTab)) return;
    const next = (["overview", "automations", "results", "invoices", "support", "profile"] as const).find(isEnabled);
    if (next) setActiveTab(next);
  }, [portalData, activeTab]);

  useEffect(() => {
    if (!portalData?.portal) return;
    document.title = `${portalData.portal.portal_title} · VectorOps`;
    const existingFavicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const previousFavicon = existingFavicon?.getAttribute("href") || null;
    const favicon = existingFavicon || document.createElement("link");
    favicon.rel = "icon";
    favicon.href = portalData.portal.favicon_url || "/favicon.ico";
    if (!favicon.parentNode) document.head.appendChild(favicon);
    return () => {
      document.title = "VectorOps — Agency Operating System";
      if (previousFavicon) favicon.href = previousFavicon;
      else favicon.remove();
    };
  }, [portalData?.portal]);

  useEffect(() => {
    setProfileName(portalData?.profile?.full_name || portalData?.client.contact_name || "");
    setProfilePhone(portalData?.profile?.phone || portalData?.client.phone || "");
  }, [portalData?.profile, portalData?.client]);

  useEffect(() => {
    if (activeTicket && portalData) setActiveTicket(portalData.tickets.find((ticket) => ticket.id === activeTicket.id) || null);
  }, [portalData?.tickets]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      if (edgeApiUrl) {
        const user = await signInForRole(email, password, "client");
        if (user?.slug !== slug) {
          await signOut();
          setAuthError("This account does not have access to this client portal.");
          return;
        }
        toast.success("Welcome to your client portal!");
        await checkPortalSession();
        return;
      }
      const res = await fetch("/api/auth/client", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Welcome to your client portal!`);
        checkPortalSession();
      } else {
        setAuthError(data.error || "Invalid email or password.");
      }
    } catch {
      setAuthError("Network error during login.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      setAuthenticated(false);
      setPortalData(null);
      toast.success("Logged out of client portal.");
    } catch {
      toast.error("Logout error.");
    }
  };

  const handleToggleWorkflow = async (wf: Workflow) => {
    const nextState = wf.desired_state === "running" ? "paused" : "running";
    try {
      const res = await fetch(`/api/portal/${slug}/workflows/${wf.id}/state`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desired_state: nextState }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Automation state updated to ${nextState}`);
        if (portalData) {
          setPortalData({
            ...portalData,
            workflows: portalData.workflows.map((w) => w.id === wf.id ? { ...w, desired_state: nextState, sync_status: "pending" } : w),
          });
        }
      } else {
        toast.error(data.error || "Could not update state.");
      }
    } catch {
      toast.error("Network error.");
    }
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject || !ticketDesc) return;
    setSubmittingTicket(true);
    try {
      const res = await fetch(`/api/portal/${slug}/tickets`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: ticketSubject,
          category: ticketCategory,
          priority: ticketPriority,
          description: ticketDesc,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Support ticket submitted! Our engineering team will review it shortly.");
        setShowTicketModal(false);
        setTicketSubject("");
        setTicketDesc("");
        checkPortalSession();
      } else {
        toast.error(data.error || "Submission failed.");
      }
    } catch {
      toast.error("Network error submitting ticket.");
    } finally {
      setSubmittingTicket(false);
    }
  };

  const handleTicketReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeTicket || !ticketReply.trim()) return;
    setSendingReply(true);
    try {
      const response = await fetch(`/api/portal/${slug}/tickets/${activeTicket.id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: ticketReply }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Reply failed.");
      setTicketReply("");
      await checkPortalSession(true);
      toast.success("Reply sent to the VectorOps team.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reply failed.");
    } finally {
      setSendingReply(false);
    }
  };

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const response = await fetch(`/api/portal/${slug}/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: profileName, phone: profilePhone }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Profile update failed.");
      setPortalData((current) => current ? { ...current, profile: result.profile } : current);
      toast.success("Profile updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Profile update failed.");
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) {
    return (
      <div className="portal-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className="panel neumorph" style={{ padding: "30px", textAlign: "center" }}>
          <div className="signal" style={{ margin: "0 auto 12px" }} />
          Loading client portal...
        </div>
      </div>
    );
  }

  // Not authenticated: Show Login Card
  if (!authenticated || !portalData) {
    return (
      <div className="portal-login-screen">
        <div className="portal-login-card panel neumorph" style={{ maxWidth: "420px", width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <div className="eyebrow" style={{ justifyContent: "center" }}>
              <span className="signal" /> VECTOROPS CLIENT PORTAL
            </div>
            <h2 style={{ margin: "6px 0 2px", fontSize: "20px" }}>CLIENT PORTAL LOGIN</h2>
            <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0 }}>
              Authenticated access to <code style={{ color: "var(--blue)" }}>/portal/{slug}</code>
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@company.com"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
              />
            </div>

            {authError && (
              <div style={{ color: "#ef4444", fontSize: "11px", marginBottom: "12px", textAlign: "center" }}>
                {authError}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10px" }}>
              <a className="text-button" href="/auth/forgot?mode=client">Forgot password?</a>
            </div>

            <button type="submit" className="primary-cta" style={{ width: "100%", justifyContent: "center" }}>
              <Lock size={15} /> LOGIN
            </button>
          </form>

          <div style={{ marginTop: "20px", textAlign: "center", borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
            <a href="/" style={{ color: "var(--muted)", fontSize: "11px", textDecoration: "none" }}>
              ← Return to Agency Control Plane
            </a>
          </div>
        </div>
      </div>
    );
  }

  const { portal, client, profile, subscription, invoices, payments = [], adjustments = [], workflows, workflowRuns = [], tickets, metrics = [], reports = [], tasks = [] } = portalData;
  const modules = new Set((portal.enabled_modules || []).map((module) => module.toLowerCase()));
  const hasModule = (module: string) => modules.has(module) || (module === "billing" && modules.has("invoices"));
  const hasOverview = hasModule("overview");
  const dashboardConfig = portal.dashboard_config || {};
  const companyDisplayName = String(dashboardConfig.company_display_name || client.company_name);
  const terminology = portal.terminology || {};
  const term = (key: string, fallback: string) => terminology[key]?.trim() || fallback;
  const visibleCards = new Set(Array.isArray(dashboardConfig.visible_cards) ? dashboardConfig.visible_cards.map(String) : ["retainer", "automations", "executions", "requests"]);
  const cardOrder = Array.isArray(dashboardConfig.card_order) ? dashboardConfig.card_order.map(String) : ["retainer", "automations", "executions", "requests"];
  const metricTotals = metrics.reduce<Record<string, number>>((totals, event) => {
    totals[event.event_type] = (totals[event.event_type] || 0) + Number(event.event_value ?? 1);
    return totals;
  }, {});
  const configuredKpis = Array.isArray(portal.kpi_config)
    ? portal.kpi_config
    : Object.entries(portal.kpi_config || {}).map(([key, label]) => ({ key, label }));
  const runsByWorkflow = workflowRuns.reduce<Map<string, WorkflowRun[]>>((runs, run) => {
    const current = runs.get(run.workflow_id) || [];
    current.push(run);
    runs.set(run.workflow_id, current);
    return runs;
  }, new Map());
  const successfulRuns = workflowRuns.filter((run) => ["success", "succeeded", "completed"].includes(run.status.toLowerCase())).length;
  const portalStyle = {
    "--blue": portal.primary_color || "#346bf2",
    "--purple": portal.accent_color || "#8b68df",
  } as CSSProperties;
  const moduleLabels: Record<typeof activeTab, string> = {
    overview: term("overview", "Overview & Results"),
    automations: term("automations", "Automations"),
    results: term("results", "Results"),
    invoices: term("billing", "Billing & Invoices"),
    support: term("support", "Support & Requests"),
    profile: term("profile", "Profile"),
  };
  const configuredModuleOrder = Array.isArray(dashboardConfig.module_order) ? dashboardConfig.module_order.map(String) : [];
  const moduleOrder = (["overview", "automations", "results", "invoices", "support", "profile"] as const)
    .filter((module) => module === "overview" ? hasOverview : module === "invoices" ? hasModule("billing") : hasModule(module))
    .sort((a, b) => {
      const ai = configuredModuleOrder.indexOf(a);
      const bi = configuredModuleOrder.indexOf(b);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });

  return (
    <div className={`client-portal-root density-${dashboardConfig.density === "compact" ? "compact" : "comfortable"} layout-${["wide", "stacked"].includes(String(dashboardConfig.layout)) ? String(dashboardConfig.layout) : "balanced"}`} style={portalStyle}>
      {/* Top Navbar */}
      <header className="portal-topbar panel neumorph">
        <div className="portal-brand">
          {portal.logo_url ? <img className="portal-logo" src={portal.logo_url} alt={`${companyDisplayName} logo`} /> : <div className="client-initial">{companyDisplayName.slice(0, 2).toUpperCase()}</div>}
          <div>
            <h3 style={{ margin: 0, fontSize: "16px" }}>{portal.portal_title || client.company_name}</h3>
            <small style={{ color: "var(--muted)", font: "10px 'DM Mono', monospace" }}>
              {term("portal_subtitle", "Executive Automation Portal")} • {profile?.full_name || client.contact_name || client.email}
            </small>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span className="badge badge-blue"><span className="signal" /> LIVE · 15S</span>
          <span className={`badge badge-${client.status === "active" ? "green" : "amber"}`}>
            <ShieldCheck size={12} /> ACCOUNT {client.status.toUpperCase()}
          </span>
          <button className="soft-button" onClick={handleLogout} style={{ padding: "6px 12px", fontSize: "11px" }}>
            <LogOut size={13} /> Log Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="portal-content">
        {/* Navigation Tabs */}
        <div className="tab-group" style={{ marginBottom: "20px" }}>
          {moduleOrder.map((module) => (
            <button key={module} className={`tab-btn ${activeTab === module ? "active" : ""}`} onClick={() => setActiveTab(module)}>
              {moduleLabels[module].toUpperCase()}
              {module === "automations" ? ` (${workflows.length})` : module === "invoices" ? ` (${invoices.length})` : module === "support" ? ` (${tickets.length})` : ""}
            </button>
          ))}
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && hasOverview && (
          <div>
            <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: "20px" }}>
              {visibleCards.has("retainer") && <div className="stat neumorph" style={{ order: cardOrder.indexOf("retainer") }}>
                <div className="stat-top">
                  <span>ACTIVE RETAINER</span>
                  <CircleDollarSign size={18} style={{ color: "var(--blue)" }} />
                </div>
                <strong>{subscription ? currency.format(subscription.monthly_amount) : "$0"}</strong>
                <small>Auto-renews Day {subscription?.billing_day || "1"}</small>
              </div>}

              {visibleCards.has("automations") && <div className="stat neumorph" style={{ order: cardOrder.indexOf("automations") }}>
                <div className="stat-top">
                  <span>RUNNING AUTOMATIONS</span>
                  <Zap size={18} style={{ color: "var(--purple)" }} />
                </div>
                <strong>{workflows.filter((w) => w.actual_state === "running").length}</strong>
                <small>{workflows.length} total provisioned</small>
              </div>}

              {visibleCards.has("executions") && <div className="stat neumorph" style={{ order: cardOrder.indexOf("executions") }}>
                <div className="stat-top">
                  <span>RECENT EXECUTIONS</span>
                  <CheckCircle2 size={18} style={{ color: "var(--green)" }} />
                </div>
                <strong>{workflowRuns.length}</strong>
                <small>{workflowRuns.length ? `${Math.round((successfulRuns / workflowRuns.length) * 100)}% successful` : "Awaiting live telemetry"}</small>
              </div>}

              {visibleCards.has("requests") && <div className="stat neumorph" style={{ order: cardOrder.indexOf("requests") }}>
                <div className="stat-top">
                  <span>OPEN REQUESTS</span>
                  <Ticket size={18} style={{ color: "var(--amber)" }} />
                </div>
                <strong>{tickets.filter((t) => t.status !== "resolved" && t.status !== "closed").length}</strong>
                <small>In engineering triage</small>
              </div>}
            </div>

            {(configuredKpis.length > 0 || metrics.length > 0) && (
              <div className="impact-banner">
                <div className="eyebrow">BUSINESS OUTCOMES / VERIFIED EVENTS</div>
                <h2 style={{ margin: "8px 0 0" }}>What VectorOps delivered</h2>
                <div className="impact-grid">
                  {(configuredKpis.length ? configuredKpis : Object.keys(metricTotals).slice(0, 4).map((key) => ({ key, label: key.replaceAll("_", " ") }))).map((kpi, index) => {
                    const key = String(kpi.key || "");
                    return (
                      <div className="impact-stat" key={`${key}-${index}`}>
                        <small>{String(kpi.label || key).replaceAll("_", " ")}</small>
                        <strong>{(metricTotals[key] || 0).toLocaleString()}</strong>
                        <span className="tag-label tag-tracked">TRACKED</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tasks.length > 0 && (
              <div className="panel neumorph" style={{ marginBottom: "20px" }}>
                <div className="eyebrow">NEXT ACTIONS</div>
                <h2 style={{ marginBottom: "12px" }}>Items visible to your team</h2>
                <div className="attention-list">
                  {tasks.filter((task) => !["completed", "cancelled"].includes(task.status)).slice(0, 5).map((task) => (
                    <div className="attention-row" key={task.id}>
                      <Clock size={15} />
                      <div><strong>{task.title}</strong><small>{task.description || "No additional details"}</small></div>
                      <span className={`badge badge-${task.priority === "urgent" || task.priority === "high" ? "red" : "blue"}`}>{task.priority}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick automation status card */}
            <div className="panel neumorph" style={{ padding: "20px", marginBottom: "20px" }}>
              <div className="panel-head" style={{ marginBottom: "14px" }}>
                <div>
                  <div className="eyebrow">AUTOMATION HEALTH</div>
                  <h2>Your Operational Workflows</h2>
                </div>
                <button className="panel-action" onClick={() => setActiveTab("automations")}>
                  Manage All Automations <ArrowUpRight size={13} />
                </button>
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                {workflows.map((wf) => (
                  <div
                    key={wf.id}
                    className="panel neumorph"
                    style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <div>
                      <strong style={{ fontSize: "13px" }}>{wf.business_name || wf.workflow_name}</strong>
                      <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--muted)" }}>{wf.business_job || "Business automation"}</p>
                      <small style={{ color: "var(--muted)" }}>{runsByWorkflow.get(wf.id)?.length || 0} recent execution(s)</small>
                    </div>
                    <span className={`badge badge-${wf.actual_state === "running" ? "green" : "amber"}`}>
                      {wf.actual_state === "running" ? "ONLINE & EXECUTING" : "PAUSED"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: AUTOMATIONS */}
        {activeTab === "automations" && (
          <div className="panel neumorph" style={{ padding: "20px" }}>
            <div className="panel-head" style={{ marginBottom: "16px" }}>
              <div>
                <div className="eyebrow">AUTOMATION CONTROLS</div>
                <h2>Managed Workflows</h2>
                <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)" }}>
                  You have full self-service authorization to pause or resume execution as needed.
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              {workflows.map((wf) => (
                <div
                  key={wf.id}
                  className="panel neumorph"
                  style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <div>
                    <h3 style={{ margin: "0 0 4px", fontSize: "14px" }}>{wf.business_name || wf.workflow_name}</h3>
                    <p style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--muted)" }}>{wf.business_job || "Business automation"}</p>
                    <span className={`badge badge-${wf.actual_state === "running" ? "green" : "amber"}`}>
                      STATUS: {wf.actual_state.toUpperCase()}
                    </span>
                    {wf.sync_status === "pending" || wf.desired_state !== wf.actual_state ? <span className="badge badge-purple" style={{ marginLeft: "6px" }}>SYNCING REQUEST</span> : null}
                    <p style={{ margin: "8px 0 0", fontSize: "10px", color: "var(--muted)", fontFamily: "monospace" }}>
                      Last run: {runsByWorkflow.get(wf.id)?.[0]?.started_at ? new Date(runsByWorkflow.get(wf.id)![0].started_at).toLocaleString() : "No execution received"}
                      {runsByWorkflow.get(wf.id)?.length ? ` · ${runsByWorkflow.get(wf.id)!.length} recent` : ""}
                    </p>
                  </div>
                  <button
                    className="action-pill"
                    onClick={() => handleToggleWorkflow(wf)}
                  >
                    {wf.desired_state === "running" ? (
                      <>
                        <Pause size={13} /> Pause Automation
                      </>
                    ) : (
                      <>
                        <Play size={13} /> Resume Automation
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "results" && hasModule("results") && (
          <ResultsPanel metrics={metrics} reports={reports} kpis={configuredKpis} dashboardConfig={dashboardConfig} />
        )}

        {/* TAB 3: INVOICES & BILLING */}
        {activeTab === "invoices" && hasModule("billing") && (
          <div>
            {subscription && (
              <div className="panel neumorph" style={{ padding: "20px", marginBottom: "18px" }}>
                <span className="eyebrow">ACTIVE RETAINER PLAN</span>
                <h3 style={{ margin: "4px 0 10px", fontSize: "16px" }}>{subscription.service_name}</h3>
                <div className="form-row-2">
                  <div>
                    <small className="muted">Monthly Retainer Amount</small>
                    <p style={{ margin: "4px 0 0", fontSize: "18px", fontWeight: 700 }}>
                      {currency.format(subscription.monthly_amount)} / mo
                    </p>
                  </div>
                  <div>
                    <small className="muted">Billing Cycle</small>
                    <p style={{ margin: "4px 0 0", fontSize: "14px" }}>
                      Renews on day {subscription.billing_day} each month
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="panel neumorph">
              <div className="panel-head" style={{ padding: "16px 20px 0" }}>
                <h2>Invoice History & Receipts</h2>
              </div>
              <table className="interactive-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Description</th>
                    <th>Total</th>
                    <th>Amount Paid</th>
                    <th>Status</th>
                    <th>Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700 }}>
                        {inv.invoice_number}
                      </td>
                      <td>{inv.description}</td>
                      <td>{currency.format(inv.total_amount)}</td>
                      <td style={{ color: "var(--green)" }}>{currency.format(inv.amount_paid)}</td>
                      <td>
                        <span
                          className={`badge badge-${
                            inv.status === "paid" ? "green" : inv.status === "partially_paid" ? "purple" : "amber"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--muted)" }}>
                        {inv.due_date}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel neumorph" style={{ marginTop: "18px" }}>
              <div className="panel-head"><div><div className="eyebrow">PAYMENT HISTORY</div><h2>Received payments</h2></div></div>
              <table className="interactive-table">
                <thead><tr><th>Date</th><th>Invoice</th><th>Method</th><th>Reference</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>{payments.length ? payments.map((payment) => {
                  const invoice = invoices.find((item) => item.id === payment.invoice_id);
                  return <tr key={payment.id}><td>{payment.payment_date}</td><td>{invoice?.invoice_number || "—"}</td><td>{payment.method || "—"}</td><td>{payment.reference || "—"}</td><td>{currency.format(payment.amount)}</td><td><span className={`badge badge-${payment.status === "received" ? "green" : "amber"}`}>{payment.status}</span></td></tr>;
                }) : <tr><td colSpan={6} className="empty-cell">No payments recorded yet.</td></tr>}</tbody>
              </table>
            </div>

            <div className="panel neumorph" style={{ marginTop: "18px" }}>
              <div className="panel-head"><div><div className="eyebrow">APPLIED ADJUSTMENTS</div><h2>Credits, discounts & schedule changes</h2></div></div>
              <table className="interactive-table">
                <thead><tr><th>Applied</th><th>Type</th><th>Description</th><th>Amount change</th><th>Days change</th></tr></thead>
                <tbody>{adjustments.length ? adjustments.map((adjustment) => <tr key={adjustment.id}><td>{adjustment.applied_at ? new Date(adjustment.applied_at).toLocaleDateString() : "—"}</td><td>{adjustment.adjustment_type.replaceAll("_", " ")}</td><td>{adjustment.description || "—"}</td><td>{currency.format(adjustment.amount_delta)}</td><td>{adjustment.days_delta}</td></tr>) : <tr><td colSpan={5} className="empty-cell">No client billing adjustments have been applied.</td></tr>}</tbody>
              </table>
            </div>

            <div className="panel neumorph financial-summary" style={{ marginTop: "18px" }}>
              <div><small>OUTSTANDING BALANCE</small><strong>{currency.format(invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.total_amount - invoice.amount_paid), 0))}</strong></div>
              <div><small>OVERDUE BALANCE</small><strong>{currency.format(invoices.filter((invoice) => invoice.status === "overdue").reduce((sum, invoice) => sum + Math.max(0, invoice.total_amount - invoice.amount_paid), 0))}</strong></div>
              <div><small>NEXT RENEWAL</small><strong>{subscription?.current_period_end || "Not scheduled"}</strong></div>
            </div>
          </div>
        )}

        {/* TAB 4: SUPPORT */}
        {activeTab === "support" && hasModule("support") && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: "18px" }}>Support & Engineering Requests</h2>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>
                  Direct communication channel with your dedicated agency automation engineers.
                </p>
              </div>
              <button className="primary-cta" onClick={() => setShowTicketModal(true)}>
                <Plus size={15} /> Submit Support Request
              </button>
            </div>

            <div className="panel neumorph">
              <table className="interactive-table">
                <thead>
                  <tr>
                    <th>Ticket #</th>
                    <th>Subject</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
                        No support requests on file.
                      </td>
                    </tr>
                  ) : (
                    tickets.map((t) => (
                      <tr key={t.id} onClick={() => setActiveTicket(t)} style={{ cursor: "pointer" }}>
                        <td style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--blue)" }}>
                          {t.ticket_number}
                        </td>
                        <td>
                          <strong>{t.subject}</strong>
                          <small style={{ display: "block", color: "var(--muted)" }}>{t.description}</small>
                        </td>
                        <td>{(t.category || "general").replace("_", " ")}</td>
                        <td>
                          <span className={`badge badge-${t.priority === "urgent" ? "red" : "amber"}`}>
                            {t.priority}
                          </span>
                        </td>
                        <td>
                          <span className={`badge badge-${t.status === "resolved" ? "green" : "blue"}`}>
                            {t.status.replace("_", " ")}
                          </span>
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--muted)" }}>
                          {t.created_at.slice(0, 10)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "profile" && hasModule("profile") && (
          <div className="portal-two-column">
            <form className="panel neumorph" onSubmit={handleProfileSave}>
              <div className="panel-head"><div><div className="eyebrow">ACCOUNT PROFILE</div><h2>Contact details</h2></div><UserCircle size={20} /></div>
              <div className="form-group"><label>Full name</label><input value={profileName} onChange={(event) => setProfileName(event.target.value)} maxLength={120} required /></div>
              <div className="form-group"><label>Email</label><input value={client.email || ""} disabled /></div>
              <div className="form-group"><label>Phone</label><input value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} maxLength={40} /></div>
              <button className="primary-cta" type="submit" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save profile"}</button>
            </form>
            <div className="panel neumorph">
              <div className="eyebrow">CLIENT SETTINGS</div>
              <h2>{term("settings", "Configured operating preferences")}</h2>
              {Object.keys(portal.client_settings_schema || {}).length ? (
                <div className="settings-definition-list">{Object.entries(portal.client_settings_schema).map(([key, definition]) => {
                  const item = definition && typeof definition === "object" ? definition as Record<string, unknown> : { label: key, default: definition };
                  return <div key={key}><small>{String(item.label || key).replaceAll("_", " ")}</small><strong>{String(item.value ?? item.default ?? "Configured by your VectorOps operator")}</strong>{item.description ? <span>{String(item.description)}</span> : null}</div>;
                })}</div>
              ) : <p className="muted">No additional client settings have been configured.</p>}
            </div>
          </div>
        )}
      </main>

      {/* SUBMIT SUPPORT TICKET MODAL */}
      {showTicketModal && (
        <div className="modal-backdrop" onMouseDown={() => setShowTicketModal(false)}>
          <div className="onboarding-modal panel neumorph" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: "540px" }}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">
                  <span className="signal" /> ENGINEERING SUPPORT TICKET
                </div>
                <h2>Submit Support Request</h2>
                <p>Describe your issue or requested adjustment for our engineers.</p>
              </div>
              <button className="close-button" onClick={() => setShowTicketModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitTicket}>
              <div className="form-group">
                <label>Subject</label>
                <input
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  placeholder="e.g. Update patient SMS copy or webhook failure"
                  required
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Category</label>
                  <select value={ticketCategory} onChange={(e) => setTicketCategory(e.target.value)}>
                    <option value="automation_issue">Automation Issue</option>
                    <option value="prompt_update">AI Prompt / Copy Tuning</option>
                    <option value="billing">Billing Inquiry</option>
                    <option value="feature_request">New Feature Request</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Priority</label>
                  <select value={ticketPriority} onChange={(e) => setTicketPriority(e.target.value as any)}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Issue Description</label>
                <textarea
                  rows={4}
                  value={ticketDesc}
                  onChange={(e) => setTicketDesc(e.target.value)}
                  placeholder="Please provide details, error messages, or sample contact records..."
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-cta" onClick={() => setShowTicketModal(false)} disabled={submittingTicket}>
                  Cancel
                </button>
                <button type="submit" className="primary-cta" disabled={submittingTicket}>
                  {submittingTicket ? "Submitting..." : "Send Request to Engineers"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTicket && (
        <div className="modal-backdrop" onMouseDown={() => setActiveTicket(null)}>
          <div className="detail-drawer panel neumorph" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-header"><div><div className="eyebrow">{activeTicket.ticket_number} / CONVERSATION</div><h2>{activeTicket.subject}</h2></div><button className="close-button" onClick={() => setActiveTicket(null)}><X size={18} /></button></div>
            <div className="conversation-thread">
              {(activeTicket.messages || []).map((message, index) => (
                <div className={`conversation-message ${message.sender_user_id === profile?.user_id ? "client" : "operator"}`} key={message.id || index}>
                  <div><strong>{message.sender_user_id === profile?.user_id ? "You" : "VectorOps"}</strong><time>{new Date(message.created_at).toLocaleString()}</time></div>
                  <p>{message.message}</p>
                </div>
              ))}
              {!(activeTicket.messages || []).length && <div className="empty-cell">No visible messages yet.</div>}
            </div>
            {activeTicket.status !== "closed" && <form onSubmit={handleTicketReply} className="conversation-reply"><label>Reply</label><textarea rows={4} value={ticketReply} onChange={(event) => setTicketReply(event.target.value)} maxLength={5000} required /><button className="primary-cta" disabled={sendingReply}><MessageCircle size={14} /> {sendingReply ? "Sending…" : "Send reply"}</button></form>}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsPanel({ metrics, reports, kpis, dashboardConfig }: {
  metrics: BusinessEvent[];
  reports: ClientReport[];
  kpis: Array<Record<string, unknown>>;
  dashboardConfig: Record<string, unknown>;
}) {
  type DisplayMetric = {
    key: string;
    label: string;
    type: "tracked" | "derived" | "estimated";
    value: number;
    formatted: string;
    previous: number | null;
  };
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("weekly");
  const analysis = useMemo(() => {
    const now = new Date();
    const periodMs = period === "daily" ? 86_400_000 : period === "weekly" ? 7 * 86_400_000 : 30 * 86_400_000;
    const currentStart = new Date(now.getTime() - periodMs);
    const previousStart = new Date(currentStart.getTime() - periodMs);
    const current = metrics.filter((event) => new Date(event.occurred_at) >= currentStart);
    const previous = metrics.filter((event) => {
      const time = new Date(event.occurred_at);
      return time >= previousStart && time < currentStart;
    });
    const sum = (events: BusinessEvent[]) => events.reduce<Record<string, number>>((totals, event) => {
      totals[event.event_type] = (totals[event.event_type] || 0) + Number(event.event_value ?? 1);
      return totals;
    }, {});
    const currentTotals = sum(current);
    const previousTotals = sum(previous);
    const daily = current.reduce<Record<string, Record<string, number>>>((buckets, event) => {
      const day = event.occurred_at.slice(0, 10);
      buckets[day] ||= {};
      buckets[day][event.event_type] = (buckets[day][event.event_type] || 0) + Number(event.event_value ?? 1);
      return buckets;
    }, {});
    return { currentTotals, previousTotals, daily };
  }, [metrics, period]);
  const latestReport = reports[0];
  const funnel = Array.isArray(dashboardConfig.funnel) ? dashboardConfig.funnel.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>> : [];

  const displayMetrics = kpis.reduce<DisplayMetric[]>((items, kpi) => {
    const key = String(kpi.key || "");
    const label = String(kpi.label || key).replaceAll("_", " ");
    const type = String(kpi.type || "tracked") as "tracked" | "derived" | "estimated";
    if (type === "derived") {
      const numerator = analysis.currentTotals[String(kpi.numerator || "")] || 0;
      const denominator = analysis.currentTotals[String(kpi.denominator || "")] || 0;
      if (!denominator) return items;
      items.push({ key, label, type, value: (numerator / denominator) * 100, formatted: `${((numerator / denominator) * 100).toFixed(1)}%`, previous: null });
      return items;
    }
    if (type === "estimated") {
      const reportMetric = latestReport?.metrics?.[key];
      const value = typeof reportMetric === "number" ? reportMetric : reportMetric && typeof reportMetric === "object" ? Number((reportMetric as Record<string, unknown>).value) : NaN;
      if (!Number.isFinite(value)) return items;
      items.push({ key, label, type, value, formatted: value.toLocaleString(), previous: null });
      return items;
    }
    const value = analysis.currentTotals[key] || 0;
    items.push({ key, label, type: "tracked", value, formatted: value.toLocaleString(), previous: analysis.previousTotals[key] || 0 });
    return items;
  }, []);

  return (
    <div className="results-workspace">
      <div className="page-header compact"><div><div className="eyebrow">VERIFIED BUSINESS RESULTS</div><h2>Performance & reporting</h2><p>Tracked values come from stored business events. Derived and estimated values appear only when configured and supported by data.</p></div><div className="tab-group">{(["daily", "weekly", "monthly"] as const).map((item) => <button key={item} className={`tab-btn ${period === item ? "active" : ""}`} onClick={() => setPeriod(item)}>{item.toUpperCase()}</button>)}</div></div>
      {displayMetrics.length ? <div className="impact-grid">{displayMetrics.map((metric) => <div className="impact-stat" key={metric.key}><small>{metric.label}</small><strong>{metric.formatted}</strong><span className={`tag-label tag-${metric.type}`}>{metric.type.toUpperCase()}</span>{metric.previous !== null && <em>{metric.value - metric.previous >= 0 ? "+" : ""}{(metric.value - metric.previous).toLocaleString()} vs prior period</em>}</div>)}</div> : <div className="panel neumorph empty-cell">No configured metrics have data for this period.</div>}

      {funnel.length > 1 && <div className="panel neumorph" style={{ marginTop: "18px" }}><div className="panel-head"><div><div className="eyebrow">CONFIGURED FUNNEL</div><h2>Stage progression</h2></div></div><div className="funnel-list">{funnel.map((stage, index) => { const key = String(stage.key || ""); const value = analysis.currentTotals[key] || 0; const priorKey = String(funnel[index - 1]?.key || ""); const prior = index ? analysis.currentTotals[priorKey] || 0 : 0; return <div key={`${key}-${index}`}><span>{String(stage.label || key).replaceAll("_", " ")}</span><strong>{value.toLocaleString()}</strong><small>{index && prior ? `${Math.min(100, (value / prior) * 100).toFixed(1)}% from prior stage` : "Tracked events"}</small></div>; })}</div></div>}

      <div className="panel neumorph" style={{ marginTop: "18px" }}><div className="panel-head"><div><div className="eyebrow">DAILY TREND</div><h2>Observed event totals</h2></div></div><table className="interactive-table"><thead><tr><th>Date</th><th>Tracked events</th><th>Total value</th></tr></thead><tbody>{Object.entries(analysis.daily).sort(([a], [b]) => b.localeCompare(a)).map(([day, values]) => <tr key={day}><td>{day}</td><td>{Object.keys(values).length}</td><td>{Object.values(values).reduce((sum, value) => sum + value, 0).toLocaleString()}</td></tr>)}{!Object.keys(analysis.daily).length && <tr><td colSpan={3} className="empty-cell">No trend data in this period.</td></tr>}</tbody></table></div>

      <div className="panel neumorph" style={{ marginTop: "18px" }}><div className="panel-head"><div><div className="eyebrow">PUBLISHED REPORTS</div><h2>Daily, weekly & monthly summaries</h2></div></div>{reports.length ? <div className="report-list">{reports.map((report) => <article key={report.id}><div><span className="badge badge-blue">{report.report_type}</span><time>{report.period_start} — {report.period_end}</time></div><h3>{report.title}</h3>{report.summary && <p>{report.summary}</p>}<small>Generated {new Date(report.generated_at).toLocaleString()}</small></article>)}</div> : <div className="empty-cell">No client-visible reports have been published.</div>}</div>
    </div>
  );
}
