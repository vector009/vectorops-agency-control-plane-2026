import { useState, useEffect } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import type { Client, Invoice, Subscription, Workflow, SupportTicket } from "@/types/vectorops";

export function ClientPortal() {
  const [, params] = useRoute("/portal/:slug");
  const slug = params?.slug || "";

  const [portalData, setPortalData] = useState<{
    client: Client;
    subscription: Subscription | null;
    invoices: Invoice[];
    workflows: Workflow[];
    tickets: SupportTicket[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState(slug === "apex-dental" ? "sarah@apexdental.com" : "");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "automations" | "invoices" | "support">("overview");

  // Support modal
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketCategory, setTicketCategory] = useState("automation_issue");
  const [ticketPriority, setTicketPriority] = useState<SupportTicket["priority"]>("medium");
  const [ticketDesc, setTicketDesc] = useState("");
  const [submittingTicket, setSubmittingTicket] = useState(false);

  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const checkPortalSession = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  useEffect(() => {
    if (slug) checkPortalSession();
  }, [slug]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
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
      await fetch("/api/portal/logout", { method: "POST", credentials: "include" });
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
            workflows: portalData.workflows.map((w) =>
              w.id === wf.id ? { ...w, desired_state: nextState, actual_state: nextState } : w
            ),
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

  const { client, subscription, invoices, workflows, tickets } = portalData;

  return (
    <div className="client-portal-root">
      {/* Top Navbar */}
      <header className="portal-topbar panel neumorph">
        <div className="portal-brand">
          <div className="client-initial">{client.company_name.slice(0, 2).toUpperCase()}</div>
          <div>
            <h3 style={{ margin: 0, fontSize: "16px" }}>{client.company_name}</h3>
            <small style={{ color: "var(--muted)", font: "10px 'DM Mono', monospace" }}>
              Executive Automation Portal • {client.contact_name || client.email}
            </small>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span className="badge badge-green">
            <ShieldCheck size={12} /> ACCOUNT ACTIVE
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
          <button
            className={`tab-btn ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            OVERVIEW & RESULTS
          </button>
          <button
            className={`tab-btn ${activeTab === "automations" ? "active" : ""}`}
            onClick={() => setActiveTab("automations")}
          >
            ACTIVE AUTOMATIONS ({workflows.length})
          </button>
          <button
            className={`tab-btn ${activeTab === "invoices" ? "active" : ""}`}
            onClick={() => setActiveTab("invoices")}
          >
            BILLING & INVOICES ({invoices.length})
          </button>
          <button
            className={`tab-btn ${activeTab === "support" ? "active" : ""}`}
            onClick={() => setActiveTab("support")}
          >
            SUPPORT & REQUESTS ({tickets.length})
          </button>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div>
            <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: "20px" }}>
              <div className="stat neumorph">
                <div className="stat-top">
                  <span>ACTIVE RETAINER</span>
                  <CircleDollarSign size={18} style={{ color: "var(--blue)" }} />
                </div>
                <strong>{subscription ? currency.format(subscription.monthly_amount) : "$0"}</strong>
                <small>Auto-renews Day {subscription?.billing_day || "1"}</small>
              </div>

              <div className="stat neumorph">
                <div className="stat-top">
                  <span>RUNNING AUTOMATIONS</span>
                  <Zap size={18} style={{ color: "var(--purple)" }} />
                </div>
                <strong>{workflows.filter((w) => w.actual_state === "running").length}</strong>
                <small>{workflows.length} total provisioned</small>
              </div>

              <div className="stat neumorph">
                <div className="stat-top">
                  <span>TOTAL INVOICES</span>
                  <CreditCard size={18} style={{ color: "var(--green)" }} />
                </div>
                <strong>{invoices.length}</strong>
                <small>{invoices.filter((i) => i.status === "paid").length} paid in full</small>
              </div>

              <div className="stat neumorph">
                <div className="stat-top">
                  <span>OPEN REQUESTS</span>
                  <Ticket size={18} style={{ color: "var(--amber)" }} />
                </div>
                <strong>{tickets.filter((t) => t.status !== "resolved" && t.status !== "closed").length}</strong>
                <small>In engineering triage</small>
              </div>
            </div>

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
                      <strong style={{ fontSize: "13px" }}>{wf.business_name}</strong>
                      <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--muted)" }}>{wf.business_job}</p>
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
                    <h3 style={{ margin: "0 0 4px", fontSize: "14px" }}>{wf.business_name}</h3>
                    <p style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--muted)" }}>{wf.business_job}</p>
                    <span className={`badge badge-${wf.actual_state === "running" ? "green" : "amber"}`}>
                      STATUS: {wf.actual_state.toUpperCase()}
                    </span>
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

        {/* TAB 3: INVOICES & BILLING */}
        {activeTab === "invoices" && (
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
          </div>
        )}

        {/* TAB 4: SUPPORT */}
        {activeTab === "support" && (
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
                      <tr key={t.id}>
                        <td style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--blue)" }}>
                          {t.ticket_number}
                        </td>
                        <td>
                          <strong>{t.subject}</strong>
                          <small style={{ display: "block", color: "var(--muted)" }}>{t.description}</small>
                        </td>
                        <td>{t.category.replace("_", " ")}</td>
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
                    <option value="medium">Medium</option>
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
    </div>
  );
}
