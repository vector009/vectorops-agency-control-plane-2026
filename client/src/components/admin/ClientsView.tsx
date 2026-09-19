import { useState, useEffect, useMemo, type CSSProperties } from "react";
import {
  Users,
  Search,
  Plus,
  ArrowUpRight,
  ChevronRight,
  Eye,
  ShieldAlert,
  ShieldCheck,
  Zap,
  CreditCard,
  Network,
  RefreshCw,
  X,
  Clock,
  AlertTriangle,
  ExternalLink,
  Ticket,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import type { Client, ClientPortalConfig, Subscription, Invoice, Workflow, N8nInstance, Payment, BillingAdjustment, ClientOnboarding, SupportTicket, Task, BusinessEvent } from "@/types/vectorops";
import { apiFetch as fetch } from "@/lib/api";

interface ClientsViewProps {
  onAddClient: () => void;
  selectedClient?: Client | null;
  onCloseDetail?: () => void;
}

export function ClientsView({ onAddClient, selectedClient: initialSelected, onCloseDetail }: ClientsViewProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeClient, setActiveClient] = useState<Client | null>(initialSelected || null);
  const [detailTab, setDetailTab] = useState<"overview" | "onboarding" | "portal" | "subscriptions" | "invoices" | "automations" | "infrastructure" | "operations">("overview");

  // Related data for active client
  const [clientSub, setClientSub] = useState<Subscription | null>(null);
  const [clientInvoices, setClientInvoices] = useState<Invoice[]>([]);
  const [clientWorkflows, setClientWorkflows] = useState<Workflow[]>([]);
  const [clientInstance, setClientInstance] = useState<N8nInstance | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [portalSlug, setPortalSlug] = useState<string>("");
  const [portalConfig, setPortalConfig] = useState<ClientPortalConfig | null>(null);
  const [clientPayments, setClientPayments] = useState<Payment[]>([]);
  const [clientAdjustments, setClientAdjustments] = useState<BillingAdjustment[]>([]);
  const [clientOnboarding, setClientOnboarding] = useState<ClientOnboarding | null>(null);
  const [clientTickets, setClientTickets] = useState<SupportTicket[]>([]);
  const [clientTasks, setClientTasks] = useState<Task[]>([]);
  const [clientActivity, setClientActivity] = useState<BusinessEvent[]>([]);

  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const loadClients = () => {
    setLoading(true);
    fetch("/api/admin/data/clients", { credentials: "include" })
      .then((res) => res.json())
      .then((body) => {
        if (body.ok) setClients(body.rows || []);
      })
      .catch(() => toast.error("Failed to load clients."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    if (initialSelected) {
      openClientDetail(initialSelected);
    }
  }, [initialSelected]);

  const openClientDetail = async (client: Client) => {
    setActiveClient(client);
    setLoadingDetail(true);
    try {
      const [subsRes, invsRes, wfsRes, instsRes, portalsRes, paymentsRes, adjustmentsRes, onboardingRes, ticketsRes, tasksRes, activityRes] = await Promise.all([
        fetch("/api/admin/data/subscriptions", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/admin/data/invoices", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/admin/data/workflows", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/admin/data/n8n_instances", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/admin/data/client_portal_config", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/admin/data/payments", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/admin/data/billing_adjustments", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/admin/data/client_onboarding", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/admin/data/support_tickets", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/admin/data/tasks", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/admin/data/business_events", { credentials: "include" }).then((r) => r.json()),
      ]);

      const sub = (subsRes.rows as Subscription[])?.find((s) => s.client_id === client.id) || null;
      const invs = (invsRes.rows as Invoice[])?.filter((i) => i.client_id === client.id) || [];
      const wfs = (wfsRes.rows as Workflow[])?.filter((w) => w.client_id === client.id) || [];

      let inst: N8nInstance | null = null;
      if (wfs.length > 0) {
        const instId = wfs[0].n8n_instance_id;
        inst = (instsRes.rows as N8nInstance[])?.find((i) => i.id === instId) || null;
      }

      setClientSub(sub);
      setClientInvoices(invs);
      setClientWorkflows(wfs);
      setClientInstance(inst);
      const config = (portalsRes.rows as ClientPortalConfig[])?.find((item) => item.client_id === client.id) || null;
      setPortalConfig(config);
      setPortalSlug(config?.slug || "");
      setClientPayments((paymentsRes.rows as Payment[] || []).filter((item) => item.client_id === client.id));
      setClientAdjustments((adjustmentsRes.rows as BillingAdjustment[] || []).filter((item) => item.client_id === client.id));
      setClientOnboarding((onboardingRes.rows as ClientOnboarding[] || []).find((item) => item.client_id === client.id) || null);
      setClientTickets((ticketsRes.rows as SupportTicket[] || []).filter((item) => item.client_id === client.id));
      setClientTasks((tasksRes.rows as Task[] || []).filter((item) => item.client_id === client.id));
      setClientActivity((activityRes.rows as BusinessEvent[] || []).filter((item) => item.client_id === client.id));
    } catch {
      toast.error("Could not fetch full client profile.");
    } finally {
      setLoadingDetail(false);
    }
  };

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const matchSearch =
        client.company_name.toLowerCase().includes(search.toLowerCase()) ||
        (client.contact_name && client.contact_name.toLowerCase().includes(search.toLowerCase())) ||
        (client.email && client.email.toLowerCase().includes(search.toLowerCase()));

      const matchStatus = statusFilter === "all" || client.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [clients, search, statusFilter]);

  // Section 54: Safe Churn Cascade
  const handleSafeChurn = async (client: Client) => {
    if (!confirm(`Are you sure you want to trigger the safe churn cascade for "${client.company_name}"? This will pause active automations and flag retainers.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/clients/${client.id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "churned" }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Client ${client.company_name} transitioned to churned status safely.`);
        loadClients();
        if (activeClient?.id === client.id) {
          openClientDetail(data.client);
        }
      } else {
        toast.error(data.error || "Failed to update client status.");
      }
    } catch {
      toast.error("Network error updating client status.");
    }
  };

  const handleReactivate = async (client: Client) => {
    try {
      const res = await fetch(`/api/admin/clients/${client.id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Client ${client.company_name} reactivated.`);
        loadClients();
        if (activeClient?.id === client.id) {
          openClientDetail(data.client);
        }
      } else {
        toast.error(data.error || "Failed to reactivate client.");
      }
    } catch {
      toast.error("Network error reactivating client.");
    }
  };

  const handleToggleWorkflow = async (workflow: Workflow) => {
    const nextState = workflow.desired_state === "running" ? "paused" : "running";
    try {
      const res = await fetch(`/api/admin/workflows/${workflow.id}/state`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desired_state: nextState }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Workflow state updated to ${nextState}`);
        setClientWorkflows((prev) => prev.map((item) => item.id === workflow.id ? { ...item, desired_state: nextState, sync_status: "pending" } : item));
      }
    } catch {
      toast.error("Failed to update workflow state.");
    }
  };

  return (
    <div className="clients-view">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="eyebrow">
            <span className="signal" /> VECTOROPS / BUSINESS PLANE
          </div>
          <h1>Business Directory & Tenancy</h1>
          <p>Multi-tenant business accounts, subscription retainers, automation workloads, and isolated business portals.</p>
        </div>
        <button className="primary-cta" onClick={onAddClient}>
          <Plus size={16} /> Onboard New Business
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="filter-bar">
        <div className="filter-search">
          <Search size={16} className="muted" />
          <input
            placeholder="Search company, contact person, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="tab-group" style={{ marginBottom: 0 }}>
          {["all", "active", "pending", "paused", "churned"].map((status) => (
            <button
              key={status}
              className={`tab-btn ${statusFilter === status ? "active" : ""}`}
              onClick={() => setStatusFilter(status)}
            >
              {status.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Clients Table */}
      <div className="panel neumorph">
        <table className="interactive-table">
          <thead>
            <tr>
              <th>Company & Contact</th>
              <th>Status</th>
              <th>Contact Email</th>
              <th>Phone</th>
              <th>Onboarded</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "30px" }}>
                  Loading client directory...
                </td>
              </tr>
            ) : filteredClients.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
                  No clients match your filter criteria.
                </td>
              </tr>
            ) : (
              filteredClients.map((client) => (
                <tr key={client.id} onClick={() => openClientDetail(client)}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div className="client-initial">{client.company_name.slice(0, 2).toUpperCase()}</div>
                      <div>
                        <strong>{client.company_name}</strong>
                        <small style={{ color: "var(--muted)", display: "block" }}>
                          {client.contact_name || "Primary contact"}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`badge badge-${
                        client.status === "active"
                          ? "green"
                          : client.status === "pending"
                          ? "blue"
                          : client.status === "paused"
                          ? "amber"
                          : "red"
                      }`}
                    >
                      {client.status}
                    </span>
                  </td>
                  <td>{client.email || "—"}</td>
                  <td>{client.phone || "—"}</td>
                  <td style={{ color: "var(--muted)", fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>
                    {client.created_at.slice(0, 10)}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
                      <button className="action-pill" onClick={() => openClientDetail(client)}>
                        Manage <ChevronRight size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Client Detail Drawer / Modal */}
      {activeClient && (
        <div
          className="modal-backdrop"
          onMouseDown={() => {
            setActiveClient(null);
            onCloseDetail?.();
          }}
        >
          <div
            className="detail-drawer panel neumorph"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <div className="eyebrow">
                  <span className="signal" /> CLIENT RECORD / {activeClient.id}
                </div>
                <h2>{activeClient.company_name}</h2>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "4px" }}>
                  <span
                    className={`badge badge-${
                      activeClient.status === "active"
                        ? "green"
                        : activeClient.status === "pending"
                        ? "blue"
                        : "red"
                    }`}
                  >
                    {activeClient.status}
                  </span>
                  <small style={{ color: "var(--muted)", font: "10px 'DM Mono', monospace" }}>
                    Tenant since {activeClient.created_at.slice(0, 10)}
                  </small>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <a
                  href={`/portal/${portalSlug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="action-pill"
                  style={{ color: "var(--blue)" }}
                >
                  <ExternalLink size={13} /> Open Tenant Portal
                </a>
                <button
                  className="close-button"
                  onClick={() => {
                    setActiveClient(null);
                    onCloseDetail?.();
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="tab-group">
              <button
                className={`tab-btn ${detailTab === "overview" ? "active" : ""}`}
                onClick={() => setDetailTab("overview")}
              >
                OVERVIEW
              </button>
              <button className={`tab-btn ${detailTab === "onboarding" ? "active" : ""}`} onClick={() => setDetailTab("onboarding")}>ONBOARDING</button>
              <button
                className={`tab-btn ${detailTab === "portal" ? "active" : ""}`}
                onClick={() => setDetailTab("portal")}
              >
                PORTAL DESIGN
              </button>
              <button
                className={`tab-btn ${detailTab === "subscriptions" ? "active" : ""}`}
                onClick={() => setDetailTab("subscriptions")}
              >
                RETAINER & SUBSCRIPTION ({clientSub ? "1" : "0"})
              </button>
              <button
                className={`tab-btn ${detailTab === "invoices" ? "active" : ""}`}
                onClick={() => setDetailTab("invoices")}
              >
                INVOICES ({clientInvoices.length})
              </button>
              <button
                className={`tab-btn ${detailTab === "automations" ? "active" : ""}`}
                onClick={() => setDetailTab("automations")}
              >
                AUTOMATIONS ({clientWorkflows.length})
              </button>
              <button
                className={`tab-btn ${detailTab === "infrastructure" ? "active" : ""}`}
                onClick={() => setDetailTab("infrastructure")}
              >
                INFRASTRUCTURE
              </button>
              <button className={`tab-btn ${detailTab === "operations" ? "active" : ""}`} onClick={() => setDetailTab("operations")}>OPERATIONS</button>
            </div>

            {loadingDetail ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>
                Loading full relationship graph...
              </div>
            ) : (
              <div>
                {/* TAB 1: OVERVIEW */}
                {detailTab === "overview" && (
                  <div>
                    <div className="metric-card-group">
                      <div className="metric-box neumorph">
                        <span>MONTHLY RETAINER</span>
                        <strong>{clientSub ? currency.format(clientSub.monthly_amount) : "$0"}</strong>
                        <small>Auto-renews day {clientSub?.billing_day || "1"}</small>
                      </div>
                      <div className="metric-box neumorph">
                        <span>ACTIVE WORKFLOWS</span>
                        <strong>{clientWorkflows.length}</strong>
                        <small>Monitored in n8n</small>
                      </div>
                      <div className="metric-box neumorph">
                        <span>TOTAL INVOICES</span>
                        <strong>{clientInvoices.length}</strong>
                        <small>{clientInvoices.filter((i) => i.status === "paid").length} reconciled</small>
                      </div>
                    </div>

                    <div className="panel neumorph" style={{ marginBottom: "18px" }}>
                      <h4 style={{ margin: "0 0 12px", fontSize: "13px" }}>Contact & Tenant Information</h4>
                      <div className="form-row-2">
                        <div>
                          <small className="muted">Primary Contact Person</small>
                          <p style={{ margin: "4px 0 10px", fontWeight: 600 }}>{activeClient.contact_name || "—"}</p>
                        </div>
                        <div>
                          <small className="muted">Email Address</small>
                          <p style={{ margin: "4px 0 10px", fontWeight: 600 }}>{activeClient.email || "—"}</p>
                        </div>
                        <div>
                          <small className="muted">Phone Number</small>
                          <p style={{ margin: "4px 0 10px", fontWeight: 600 }}>{activeClient.phone || "—"}</p>
                        </div>
                        <div>
                          <small className="muted">Portal Access Route</small>
                          <p style={{ margin: "4px 0 10px", fontWeight: 600, fontFamily: "monospace", color: "var(--blue)" }}>
                            /portal/{portalSlug}
                          </p>
                        </div>
                      </div>
                      {activeClient.notes && (
                        <div style={{ marginTop: "12px", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                          <small className="muted">Internal Operator Notes</small>
                          <p style={{ margin: "4px 0 0", fontSize: "12px" }}>{activeClient.notes}</p>
                        </div>
                      )}
                    </div>

                    <div className="panel neumorph" style={{ marginBottom: "18px" }}>
                      <div className="panel-head"><div><span className="eyebrow">FINANCIAL HEALTH</span><h2>Balance & payment timeline</h2></div></div>
                      <div className="metric-card-group"><div className="metric-box"><span>OUTSTANDING</span><strong>{currency.format(clientInvoices.reduce((sum, invoice) => sum + Math.max(0, invoice.total_amount - invoice.amount_paid), 0))}</strong></div><div className="metric-box"><span>PAYMENTS</span><strong>{clientPayments.length}</strong></div><div className="metric-box"><span>ADJUSTMENTS</span><strong>{clientAdjustments.length}</strong></div></div>
                      <div className="financial-timeline">{[...clientPayments.map((item) => ({ id: item.id, date: item.payment_date, label: `Payment · ${currency.format(item.amount)}`, detail: item.reference || item.method || "Recorded payment" })), ...clientAdjustments.map((item) => ({ id: item.id, date: item.created_at, label: `${item.adjustment_type.replaceAll("_", " ")} · ${currency.format(item.amount_delta)}`, detail: item.description || `${item.days_delta} day adjustment` }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((item) => <div key={item.id}><time>{item.date.slice(0, 10)}</time><strong>{item.label}</strong><span>{item.detail}</span></div>)}{!clientPayments.length && !clientAdjustments.length && <div className="empty-cell">No payment or adjustment history.</div>}</div>
                    </div>

                    {/* Section 54: Safe Churn & Reactivation Controls */}
                    <div className="panel neumorph" style={{ border: "1px dashed var(--line)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <h4 style={{ margin: "0 0 4px", fontSize: "13px" }}>Tenant Lifecycle Engine</h4>
                          <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)" }}>
                            Cascade state changes to subscriptions, automations, and client portal authentication.
                          </p>
                        </div>
                        {activeClient.status === "active" ? (
                          <button
                            className="action-pill danger"
                            onClick={() => handleSafeChurn(activeClient)}
                          >
                            <ShieldAlert size={14} /> Safe Churn Client
                          </button>
                        ) : (
                          <button
                            className="action-pill"
                            style={{ color: "var(--green)" }}
                            onClick={() => handleReactivate(activeClient)}
                          >
                            <ShieldCheck size={14} /> Reactivate Client
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {detailTab === "onboarding" && clientOnboarding && <OnboardingProgress clientId={activeClient.id} value={clientOnboarding} onChange={setClientOnboarding} />}
                {detailTab === "onboarding" && !clientOnboarding && <div className="panel neumorph empty-cell">No persisted onboarding record exists for this client.</div>}

                {/* TAB 2: SUBSCRIPTION */}
                {detailTab === "portal" && portalConfig && (
                  <PortalConfigEditor
                    client={activeClient}
                    initialConfig={portalConfig}
                    onSaved={(config) => {
                      setPortalConfig(config);
                      setPortalSlug(config.slug);
                    }}
                  />
                )}

                {detailTab === "portal" && !portalConfig && (
                  <div className="panel neumorph" style={{ textAlign: "center", color: "var(--muted)" }}>
                    This client does not have a portal configuration yet.
                  </div>
                )}

                {/* TAB 3: SUBSCRIPTION */}
                {detailTab === "subscriptions" && (
                  <div>
                    {clientSub ? (
                      <div className="panel neumorph">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                          <div>
                            <span className="eyebrow">RECURRING RETAINER</span>
                            <h3 style={{ margin: "4px 0" }}>{clientSub.service_name}</h3>
                          </div>
                          <span className={`badge badge-${clientSub.status === "active" ? "green" : "amber"}`}>
                            {clientSub.status}
                          </span>
                        </div>
                        <div className="form-row-2">
                          <div>
                            <small className="muted">Monthly Retainer Amount</small>
                            <p style={{ margin: "4px 0 10px", fontSize: "18px", fontWeight: 700 }}>
                              {currency.format(clientSub.monthly_amount)} / mo
                            </p>
                          </div>
                          <div>
                            <small className="muted">Billing Day of Month</small>
                            <p style={{ margin: "4px 0 10px", fontSize: "18px", fontWeight: 700 }}>
                              Day {clientSub.billing_day}
                            </p>
                          </div>
                          <div>
                            <small className="muted">Next Scheduled Invoice</small>
                            <p style={{ margin: "4px 0 10px", fontFamily: "monospace" }}>
                              {clientSub.next_billing_date || clientSub.current_period_end || "Not scheduled"}
                            </p>
                          </div>
                          <div>
                            <small className="muted">Auto-Renew Policy</small>
                            <p style={{ margin: "4px 0 10px" }}>
                              {clientSub.auto_renew ? "Automatic renewal enabled" : "Manual renewal"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="muted" style={{ textAlign: "center", padding: "30px" }}>
                        No recurring subscription configured for this client.
                      </p>
                    )}
                  </div>
                )}

                {/* TAB 3: INVOICES */}
                {detailTab === "invoices" && (
                  <div>
                    <table className="interactive-table">
                      <thead>
                        <tr>
                          <th>Invoice #</th>
                          <th>Period</th>
                          <th>Total Amount</th>
                          <th>Paid Amount</th>
                          <th>Status</th>
                          <th>Due Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientInvoices.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: "center", padding: "20px", color: "var(--muted)" }}>
                              No invoices on record.
                            </td>
                          </tr>
                        ) : (
                          clientInvoices.map((inv) => (
                            <tr key={inv.id}>
                              <td>
                                <strong>{inv.invoice_number}</strong>
                                <small style={{ display: "block", color: "var(--muted)" }}>{inv.description}</small>
                              </td>
                              <td style={{ fontFamily: "monospace", fontSize: "10px" }}>
                                {inv.period_start ? `${inv.period_start} to ${inv.period_end}` : "One-time"}
                              </td>
                              <td>{currency.format(inv.total_amount)}</td>
                              <td>{currency.format(inv.amount_paid)}</td>
                              <td>
                                <span
                                  className={`badge badge-${
                                    inv.status === "paid"
                                      ? "green"
                                      : inv.status === "partially_paid"
                                      ? "purple"
                                      : inv.status === "overdue"
                                      ? "red"
                                      : "amber"
                                  }`}
                                >
                                  {inv.status}
                                </span>
                              </td>
                              <td style={{ fontFamily: "monospace", fontSize: "10px" }}>{inv.due_date}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* TAB 4: AUTOMATIONS */}
                {detailTab === "automations" && (
                  <div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {clientWorkflows.length === 0 ? (
                        <p className="muted" style={{ textAlign: "center", padding: "30px" }}>
                          No automations provisioned for this tenant yet.
                        </p>
                      ) : (
                        clientWorkflows.map((wf) => (
                          <div key={wf.id} className="panel neumorph" style={{ padding: "14px 18px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <strong style={{ fontSize: "13px" }}>{wf.business_name}</strong>
                                <p style={{ margin: "2px 0 4px", fontSize: "11px", color: "var(--muted)" }}>
                                  {wf.business_job} • n8n ID: {wf.n8n_workflow_id}
                                </p>
                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                  <span
                                    className={`badge badge-${
                                      wf.actual_state === "running" ? "green" : "amber"
                                    }`}
                                  >
                                    ACTUAL: {wf.actual_state}
                                  </span>
                                  <span className="badge badge-muted">
                                    DESIRED: {wf.desired_state}
                                  </span>
                                </div>
                              </div>
                              <button
                                className="action-pill"
                                onClick={() => handleToggleWorkflow(wf)}
                              >
                                {wf.desired_state === "running" ? "Pause Execution" : "Resume Execution"}
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 5: INFRASTRUCTURE */}
                {detailTab === "infrastructure" && (
                  <div>
                    {clientInstance ? (
                      <div className="panel neumorph">
                        <span className="eyebrow">ATTACHED N8N CLUSTER</span>
                        <h3 style={{ margin: "4px 0 12px" }}>{clientInstance.instance_name}</h3>
                        <div className="form-row-2">
                          <div>
                            <small className="muted">Endpoint URL</small>
                            <p style={{ margin: "4px 0 10px", fontFamily: "monospace" }}>{clientInstance.base_url}</p>
                          </div>
                          <div>
                            <small className="muted">Hosting Model</small>
                            <p style={{ margin: "4px 0 10px", textTransform: "capitalize" }}>{clientInstance.hosting_type}</p>
                          </div>
                          <div>
                            <small className="muted">Health Status</small>
                            <p style={{ margin: "4px 0 10px" }}>
                              <span className="badge badge-green">{clientInstance.status}</span>
                            </p>
                          </div>
                          <div>
                            <small className="muted">Last Verification Heartbeat</small>
                            <p style={{ margin: "4px 0 10px", fontFamily: "monospace", fontSize: "10px" }}>
                              {clientInstance.last_verified_at}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="muted" style={{ textAlign: "center", padding: "30px" }}>
                        Shared n8n cluster is handling this tenant.
                      </p>
                    )}
                  </div>
                )}

                {detailTab === "operations" && (
                  <div className="portal-two-column">
                    <div className="panel neumorph"><div className="panel-head"><div><span className="eyebrow">HEALTH & SUPPORT</span><h2>{clientTickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length} open tickets</h2></div></div>{clientTickets.length ? clientTickets.map((ticket) => <div className="attention-row" key={ticket.id}><Ticket size={14} /><div><strong>{ticket.subject}</strong><small>{ticket.ticket_number} · {ticket.status.replaceAll("_", " ")}</small></div></div>) : <div className="empty-cell">No support tickets.</div>}</div>
                    <div className="panel neumorph"><div className="panel-head"><div><span className="eyebrow">TASKS</span><h2>{clientTasks.filter((task) => !["completed", "cancelled"].includes(task.status)).length} active items</h2></div></div>{clientTasks.length ? clientTasks.map((task) => <div className="attention-row" key={task.id}><CheckCircle2 size={14} /><div><strong>{task.title}</strong><small>{task.status.replaceAll("_", " ")} · {task.priority}</small></div></div>) : <div className="empty-cell">No tenant tasks.</div>}</div>
                    <div className="panel neumorph" style={{ gridColumn: "1/-1" }}><div className="panel-head"><div><span className="eyebrow">CLIENT ACTIVITY</span><h2>Business event timeline</h2></div></div>{clientActivity.length ? clientActivity.slice(0, 20).map((event) => <div className="financial-timeline" key={event.id}><div><time>{new Date(event.occurred_at).toLocaleString()}</time><strong>{event.event_type.replaceAll("_", " ")}</strong><span>{event.event_value == null ? "Recorded" : `Value ${event.event_value}`}</span></div></div>) : <div className="empty-cell">No business activity recorded.</div>}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OnboardingProgress({ clientId, value, onChange }: { clientId: string; value: ClientOnboarding; onChange: (value: ClientOnboarding) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const stages: Array<[keyof ClientOnboarding, string, string]> = [
    ["identity_complete", "Identity", "Client and contact record"],
    ["portal_complete", "Portal configuration", "Brand, modules, and route"],
    ["commercial_complete", "Commercial", "Retainer and billing terms"],
    ["infrastructure_complete", "Infrastructure", "Execution environment selected"],
    ["automations_complete", "Automation configuration", "At least one explicitly mapped workflow"],
    ["n8n_complete", "n8n setup", "Connected client n8n assignment"],
    ["account_complete", "Account", "Client authentication profile"],
    ["verification_complete", "Verification", "Active instance with successful sync"],
    ["access_sent", "Access delivery", "Portal access delivered to client"],
  ];
  const update = async (stage: keyof ClientOnboarding, complete: boolean) => {
    setBusy(stage);
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/onboarding`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage, complete }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to update onboarding.");
      onChange(result.onboarding);
      toast.success(`${stages.find(([key]) => key === stage)?.[1]} updated.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update onboarding."); }
    finally { setBusy(null); }
  };
  const completed = stages.filter(([key]) => value[key] === true).length;
  return <div className="panel neumorph"><div className="panel-head"><div><span className="eyebrow">PERSISTED ONBOARDING</span><h2>{completed} of {stages.length} stages complete</h2><p>Incomplete clients can resume here. Dependency-backed stages are rejected until their real prerequisites pass.</p></div>{value.completed_at && <span className="badge badge-green">COMPLETE</span>}</div><div className="onboarding-stage-list">{stages.map(([key, label, description]) => <label key={key} className={value[key] ? "complete" : ""}><input type="checkbox" checked={value[key] === true} disabled={!!busy} onChange={(event) => void update(key, event.target.checked)} /><span><strong>{label}</strong><small>{description}</small></span><em>{busy === key ? "Checking…" : value[key] ? "Complete" : "Required"}</em></label>)}</div></div>;
}

function PortalConfigEditor({ client, initialConfig, onSaved }: {
  client: Client;
  initialConfig: ClientPortalConfig;
  onSaved: (config: ClientPortalConfig) => void;
}) {
  const [config, setConfig] = useState({
    ...initialConfig,
    enabled_modules: initialConfig.enabled_modules.map((module) => module.toLowerCase()),
  });
  const [kpiText, setKpiText] = useState(
    (Array.isArray(initialConfig.kpi_config) ? initialConfig.kpi_config : Object.entries(initialConfig.kpi_config || {}).map(([key, label]) => ({ key, label })))
      .map((item) => { const value = item as Record<string, unknown>; return `${String(value.key || "")}:${String(value.label || "")}:${String(value.type || "tracked")}:${String(value.numerator || "")}:${String(value.denominator || "")}`; })
      .join("\n"),
  );
  const [terminologyText, setTerminologyText] = useState(Object.entries(initialConfig.terminology || {}).map(([key, label]) => `${key}:${label}`).join("\n"));
  const [settingsText, setSettingsText] = useState(JSON.stringify(initialConfig.client_settings_schema || {}, null, 2));
  const [companyDisplayName, setCompanyDisplayName] = useState(String(initialConfig.dashboard_config?.company_display_name || client.company_name));
  const [density, setDensity] = useState(String(initialConfig.dashboard_config?.density || "comfortable"));
  const [layout, setLayout] = useState(String(initialConfig.dashboard_config?.layout || "balanced"));
  const [visibleCards, setVisibleCards] = useState<string[]>(Array.isArray(initialConfig.dashboard_config?.visible_cards) ? initialConfig.dashboard_config.visible_cards.map(String) : ["retainer", "automations", "executions", "requests"]);
  const [cardOrderText, setCardOrderText] = useState((Array.isArray(initialConfig.dashboard_config?.card_order) ? initialConfig.dashboard_config.card_order : ["retainer", "automations", "executions", "requests"]).join(", "));
  const [moduleOrderText, setModuleOrderText] = useState((Array.isArray(initialConfig.dashboard_config?.module_order) ? initialConfig.dashboard_config.module_order : initialConfig.enabled_modules).join(", "));
  const [saving, setSaving] = useState(false);
  const modules = ["overview", "automations", "results", "billing", "support", "profile"];
  const cards = ["retainer", "automations", "executions", "requests"];

  const restore = (source: ClientPortalConfig) => {
    setConfig({ ...source, enabled_modules: source.enabled_modules.map((module) => module.toLowerCase()) });
    setKpiText((Array.isArray(source.kpi_config) ? source.kpi_config : Object.entries(source.kpi_config || {}).map(([key, label]) => ({ key, label }))).map((item) => { const value = item as Record<string, unknown>; return `${String(value.key || "")}:${String(value.label || "")}:${String(value.type || "tracked")}:${String(value.numerator || "")}:${String(value.denominator || "")}`; }).join("\n"));
    setTerminologyText(Object.entries(source.terminology || {}).map(([key, label]) => `${key}:${label}`).join("\n"));
    setSettingsText(JSON.stringify(source.client_settings_schema || {}, null, 2));
    setCompanyDisplayName(String(source.dashboard_config?.company_display_name || client.company_name));
    setDensity(String(source.dashboard_config?.density || "comfortable"));
    setLayout(String(source.dashboard_config?.layout || "balanced"));
    setVisibleCards(Array.isArray(source.dashboard_config?.visible_cards) ? source.dashboard_config.visible_cards.map(String) : cards);
    setCardOrderText((Array.isArray(source.dashboard_config?.card_order) ? source.dashboard_config.card_order : cards).join(", "));
    setModuleOrderText((Array.isArray(source.dashboard_config?.module_order) ? source.dashboard_config.module_order : source.enabled_modules).join(", "));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const kpiConfig = kpiText.split("\n").map((line) => {
      const [key, label, type = "tracked", numerator = "", denominator = ""] = line.split(":");
      return { key: key.trim(), label: label?.trim() || key.trim().replaceAll("_", " "), type: type.trim(), ...(numerator.trim() ? { numerator: numerator.trim() } : {}), ...(denominator.trim() ? { denominator: denominator.trim() } : {}) };
    }).filter((item) => item.key);
    try {
      const terminology = Object.fromEntries(terminologyText.split("\n").filter(Boolean).map((line) => {
        const [key, ...label] = line.split(":");
        return [key.trim(), label.join(":").trim()];
      }).filter(([key, label]) => key && label));
      const clientSettingsSchema = JSON.parse(settingsText || "{}") as Record<string, unknown>;
      if (!clientSettingsSchema || typeof clientSettingsSchema !== "object" || Array.isArray(clientSettingsSchema)) throw new Error("Client settings schema must be a JSON object.");
      const normalizeOrder = (value: string, allowed: string[]) => Array.from(new Set(value.split(",").map((item) => item.trim().toLowerCase()).filter((item) => allowed.includes(item))));
      const dashboardConfig = {
        ...(config.dashboard_config || {}),
        company_display_name: companyDisplayName.trim(),
        density,
        layout,
        visible_cards: visibleCards,
        card_order: normalizeOrder(cardOrderText, cards),
        module_order: normalizeOrder(moduleOrderText, modules),
      };
      const response = await fetch(`/api/admin/clients/${client.id}/portal-config`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, dashboard_config: dashboardConfig, kpi_config: kpiConfig, terminology, client_settings_schema: clientSettingsSchema }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Portal update failed.");
      const normalizedPortal = {
        ...result.portal,
        enabled_modules: result.portal.enabled_modules.map((module: string) => module.toLowerCase()),
      };
      setConfig(normalizedPortal);
      restore(normalizedPortal);
      onSaved(normalizedPortal);
      toast.success("Client portal design and modules updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Portal update failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="panel neumorph portal-config-editor">
      <div className="panel-head">
        <div><span className="eyebrow">CLIENT-SPECIFIC EXPERIENCE</span><h2>Brand, modules & business KPIs</h2></div>
        <a className="action-pill" href={`/portal/${config.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Preview</a>
      </div>
      <div className="form-row-2">
        <div className="form-group"><label>Portal Title</label><input value={config.portal_title} onChange={(event) => setConfig({ ...config, portal_title: event.target.value })} required /></div>
        <div className="form-group"><label>Portal Slug</label><input value={config.slug} onChange={(event) => setConfig({ ...config, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} required /></div>
        <div className="form-group"><label>Company Display Name</label><input value={companyDisplayName} onChange={(event) => setCompanyDisplayName(event.target.value)} maxLength={120} required /></div>
        <div className="form-group"><label>Visual Density</label><select value={density} onChange={(event) => setDensity(event.target.value)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div>
        <div className="form-group"><label>Dashboard Layout</label><select value={layout} onChange={(event) => setLayout(event.target.value)}><option value="balanced">Balanced grid</option><option value="wide">Wide data</option><option value="stacked">Stacked sections</option></select></div>
        <div className="form-group"><label>Primary Color</label><input type="color" value={config.primary_color} onChange={(event) => setConfig({ ...config, primary_color: event.target.value })} /></div>
        <div className="form-group"><label>Accent Color</label><input type="color" value={config.accent_color} onChange={(event) => setConfig({ ...config, accent_color: event.target.value })} /></div>
      </div>
      <div className="form-group"><label>Logo URL</label><input type="url" value={config.logo_url || ""} onChange={(event) => setConfig({ ...config, logo_url: event.target.value || null })} placeholder="https://cdn.example.com/logo.png" /></div>
      <div className="form-group"><label>Favicon URL</label><input type="url" value={config.favicon_url || ""} onChange={(event) => setConfig({ ...config, favicon_url: event.target.value || null })} placeholder="https://cdn.example.com/favicon.png" /></div>
      <div className="form-group">
        <label>Enabled Modules</label>
        <div className="module-picker">{modules.map((module) => <label className="module-option" key={module}><input type="checkbox" checked={config.enabled_modules.includes(module)} onChange={() => setConfig({ ...config, enabled_modules: config.enabled_modules.includes(module) ? config.enabled_modules.filter((item) => item !== module) : [...config.enabled_modules, module] })} />{module}</label>)}</div>
      </div>
      <div className="form-group"><label>Visible Overview Cards</label><div className="module-picker">{cards.map((card) => <label className="module-option" key={card}><input type="checkbox" checked={visibleCards.includes(card)} onChange={() => setVisibleCards(visibleCards.includes(card) ? visibleCards.filter((item) => item !== card) : [...visibleCards, card])} />{card}</label>)}</div></div>
      <div className="form-row-2"><div className="form-group"><label>Card Order (comma separated)</label><input value={cardOrderText} onChange={(event) => setCardOrderText(event.target.value)} /></div><div className="form-group"><label>Module Order (comma separated)</label><input value={moduleOrderText} onChange={(event) => setModuleOrderText(event.target.value)} /></div></div>
      <div className="form-group"><label>Business KPIs (key:label:type:numerator:denominator)</label><textarea rows={4} value={kpiText} onChange={(event) => setKpiText(event.target.value)} placeholder={'lead_captured:New patients:tracked::\nconversion_rate:Conversion rate:derived:appointment_booked:lead_captured'} /><small className="muted">Tracked values use business events. Derived values require numerator and denominator keys. Estimated values appear only when a published report provides the key.</small></div>
      <div className="form-row-2"><div className="form-group"><label>Client-Facing Terminology (key:label)</label><textarea rows={5} value={terminologyText} onChange={(event) => setTerminologyText(event.target.value)} placeholder={'automations:Workflows\nresults:Outcomes'} /></div><div className="form-group"><label>Client Settings Schema (JSON)</label><textarea rows={5} value={settingsText} onChange={(event) => setSettingsText(event.target.value)} spellCheck={false} /></div></div>
      <div className="portal-brand-preview" style={{ "--preview-primary": config.primary_color, "--preview-accent": config.accent_color } as CSSProperties}>
        <span>LIVE BRAND PREVIEW · {density.toUpperCase()}</span><strong>{config.portal_title}</strong><small>{companyDisplayName} · /portal/{config.slug}</small>
      </div>
      <div className="modal-actions"><button className="secondary-cta" type="button" onClick={() => restore(initialConfig)} disabled={saving}>Cancel changes</button><button className="secondary-cta" type="button" onClick={() => { setDensity("comfortable"); setLayout("balanced"); setVisibleCards(cards); setCardOrderText(cards.join(", ")); setModuleOrderText(modules.join(", ")); setTerminologyText(""); setSettingsText("{}"); }} disabled={saving}>Reset defaults</button><button className="primary-cta" type="submit" disabled={saving}>{saving ? "Saving..." : "Save Portal Configuration"}</button></div>
    </form>
  );
}
