import { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import type { Client, Subscription, Invoice, Workflow, N8nInstance } from "@/types/vectorops";

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
  const [detailTab, setDetailTab] = useState<"overview" | "subscriptions" | "invoices" | "automations" | "infrastructure">("overview");

  // Related data for active client
  const [clientSub, setClientSub] = useState<Subscription | null>(null);
  const [clientInvoices, setClientInvoices] = useState<Invoice[]>([]);
  const [clientWorkflows, setClientWorkflows] = useState<Workflow[]>([]);
  const [clientInstance, setClientInstance] = useState<N8nInstance | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [portalSlug, setPortalSlug] = useState<string>("");

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
      const [subsRes, invsRes, wfsRes, instsRes] = await Promise.all([
        fetch("/api/admin/data/subscriptions", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/admin/data/invoices", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/admin/data/workflows", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/admin/data/n8n_instances", { credentials: "include" }).then((r) => r.json()),
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

      // Guess or derive slug from company name
      const slugCandidate = client.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      setPortalSlug(slugCandidate);
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
        setClientWorkflows((prev) =>
          prev.map((w) => (w.id === workflow.id ? { ...w, desired_state: nextState, actual_state: nextState } : w))
        );
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
          <h1>Client Directory & Tenancy</h1>
          <p>Multi-tenant accounts, subscription retainers, automation workloads, and isolated client portals.</p>
        </div>
        <button className="primary-cta" onClick={onAddClient}>
          <Plus size={16} /> Onboard New Client
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

                {/* TAB 2: SUBSCRIPTION */}
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
                              {clientSub.next_billing_date}
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
