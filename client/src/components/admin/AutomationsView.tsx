import { useState, useEffect, useMemo } from "react";
import {
  Zap,
  Play,
  Pause,
  AlertCircle,
  RefreshCw,
  Search,
  Plus,
  ArrowUpRight,
  Sparkles,
  Layers,
  Building2,
  X,
  Radio,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch as fetch } from "@/lib/api";
import type { Workflow, DiscoveredWorkflow, AutomationTemplate, Client, N8nInstance } from "@/types/vectorops";

export function AutomationsView() {
  const [tab, setTab] = useState<"managed" | "discovered" | "templates">("managed");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredWorkflow[]>([]);
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [instances, setInstances] = useState<N8nInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");

  // Mapping modal
  const [selectedDiscovered, setSelectedDiscovered] = useState<DiscoveredWorkflow[] | null>(null);
  const [mapTarget, setMapTarget] = useState<DiscoveredWorkflow | null>(null);
  const [deployTarget, setDeployTarget] = useState<AutomationTemplate | null>(null);

  const loadData = (silent = false) => {
    if (!silent) setLoading(true);
    return Promise.all([
      fetch("/api/admin/data/workflows", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/data/discovered_workflows", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/data/automation_templates", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/data/clients", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/data/n8n_instances", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([wfRes, discRes, tmplRes, cliRes, instRes]) => {
        if (wfRes.ok) setWorkflows(wfRes.rows || []);
        if (discRes.ok) setDiscovered(discRes.rows || []);
        if (tmplRes.ok) setTemplates(tmplRes.rows || []);
        if (cliRes.ok) setClients(cliRes.rows || []);
        if (instRes.ok) setInstances(instRes.rows || []);
      })
      .catch(() => toast.error("Failed to load automations."))
      .finally(() => { if (!silent) setLoading(false); });
  };

  useEffect(() => {
    loadData();
    const refresh = () => {
      if (document.visibilityState === "visible") void loadData(true);
    };
    const interval = window.setInterval(refresh, 20_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const synchronizeN8n = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/admin/n8n/sync", { method: "POST", credentials: "include" });
      const result = await response.json();
      const failures = Array.isArray(result.results) ? result.results.filter((item: { ok?: boolean }) => !item.ok).length : 0;
      if (!response.ok || !result.ok) throw new Error(failures ? `${failures} n8n instance(s) failed to sync.` : result.error || "n8n sync failed.");
      toast.success(`Live n8n telemetry synchronized for ${result.results?.length || 0} instance(s).`);
      await loadData(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to synchronize n8n.");
    } finally {
      setSyncing(false);
    }
  };

  const clientMap = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => map.set(c.id, c.company_name));
    return map;
  }, [clients]);

  // Section 55: Desired vs Actual state toggle
  const toggleWorkflowState = async (wf: Workflow) => {
    const nextState = wf.desired_state === "running" ? "paused" : "running";
    try {
      const res = await fetch(`/api/admin/workflows/${wf.id}/state`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desired_state: nextState }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Automation state updated to ${nextState}`);
        setWorkflows((prev) => prev.map((item) => (item.id === wf.id ? { ...item, desired_state: nextState, sync_status: "pending" } : item)));
      } else {
        toast.error(data.error || "Failed to update state.");
      }
    } catch {
      toast.error("Network error.");
    }
  };

  const filteredWorkflows = useMemo(() => {
    return workflows.filter(
      (w) =>
        (w.business_name || w.workflow_name).toLowerCase().includes(search.toLowerCase()) ||
        (w.business_job || "").toLowerCase().includes(search.toLowerCase()) ||
        (clientMap.get(w.client_id) || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [workflows, search, clientMap]);

  return (
    <div className="automations-view">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="eyebrow">
            <span className="signal" /> VECTOROPS / AUTOMATION CONTROL PLANE
          </div>
          <h1>Automations & Workflows</h1>
          <p>Desired-state control engine, n8n cluster telemetry, and reusable multi-tenant templates.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <span className="badge badge-blue" style={{ alignSelf: "center" }}><span className="signal" /> LIVE · 20S</span>
          <button className="soft-button" onClick={synchronizeN8n} disabled={syncing}>
            <Radio size={15} /> {syncing ? "Syncing n8n..." : "Sync n8n Now"}
          </button>
          <button className="soft-button" onClick={() => loadData()}>
            <RefreshCw size={15} /> Refresh Telemetry
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-group">
        <button
          className={`tab-btn ${tab === "managed" ? "active" : ""}`}
          onClick={() => setTab("managed")}
        >
          ACTIVE AUTOMATIONS ({workflows.length})
        </button>
        <button
          className={`tab-btn ${tab === "discovered" ? "active" : ""}`}
          onClick={() => setTab("discovered")}
        >
          DISCOVERED WORKFLOWS ({discovered.filter((d) => d.status === "unmapped").length} UNMAPPED)
        </button>
        <button
          className={`tab-btn ${tab === "templates" ? "active" : ""}`}
          onClick={() => setTab("templates")}
        >
          REUSABLE TEMPLATES ({templates.length})
        </button>
      </div>

      {/* Content */}
      <div className="panel neumorph">
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>Loading workflows...</div>
        ) : (
          <div>
            {/* TAB 1: MANAGED WORKFLOWS */}
            {tab === "managed" && (
              <div>
                <div className="filter-bar" style={{ padding: "10px 14px 0" }}>
                  <div className="filter-search">
                    <Search size={15} className="muted" />
                    <input
                      placeholder="Filter by business function, job, or client..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>

                <table className="interactive-table">
                  <thead>
                    <tr>
                      <th>Automation & Business Job</th>
                      <th>Client</th>
                      <th>Instance</th>
                      <th>Sync Posture</th>
                      <th>Execution State</th>
                      <th>Last Execution</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWorkflows.map((wf) => (
                      <tr key={wf.id}>
                        <td>
                          <strong>{wf.business_name || wf.workflow_name}</strong>
                          <small style={{ display: "block", color: "var(--muted)" }}>
                            {wf.business_job || "Business automation"} • ID: {wf.n8n_workflow_id}
                          </small>
                        </td>
                        <td>{clientMap.get(wf.client_id) || wf.client_id}</td>
                        <td style={{ fontFamily: "monospace", fontSize: "10px" }}>{wf.n8n_instance_id}</td>
                        <td>
                          <span
                            className={`badge badge-${
                              wf.sync_status === "success" ? "green" : wf.sync_status === "error" ? "red" : "amber"
                            }`}
                          >
                            {wf.sync_status || "idle"}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
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
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--muted)" }}>
                          {wf.last_success_at ? wf.last_success_at.slice(0, 19).replace("T", " ") : "Pending"}
                        </td>
                        <td>
                          <button
                            className="action-pill"
                            onClick={() => toggleWorkflowState(wf)}
                          >
                            {wf.desired_state === "running" ? (
                              <>
                                <Pause size={12} /> Pause
                              </>
                            ) : (
                              <>
                                <Play size={12} /> Run
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 2: DISCOVERED WORKFLOWS */}
            {tab === "discovered" && (
              <div>
                <p style={{ padding: "14px 14px 0", color: "var(--muted)", fontSize: "12px" }}>
                  Discovered workflows from connected n8n execution nodes waiting for client business mapping:
                </p>
                <table className="interactive-table">
                  <thead>
                    <tr>
                      <th>n8n Workflow Name</th>
                      <th>Instance Node</th>
                      <th>n8n ID</th>
                      <th>Discovery Date</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discovered.map((disc) => (
                      <tr key={disc.id}>
                        <td>
                          <strong>{disc.name_in_n8n || disc.discovered_name || disc.n8n_workflow_id}</strong>
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: "10px" }}>{disc.n8n_instance_id}</td>
                        <td style={{ fontFamily: "monospace", fontSize: "10px" }}>{disc.n8n_workflow_id}</td>
                        <td style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--muted)" }}>
                          {(disc.discovered_at || disc.first_seen_at).slice(0, 10)}
                        </td>
                        <td>
                          <span
                            className={`badge badge-${
                              disc.status === "mapped" ? "green" : "amber"
                            }`}
                          >
                            {disc.status}
                          </span>
                        </td>
                        <td>
                          {disc.status === "unmapped" ? (
                            <button
                              className="action-pill"
                              onClick={() => setMapTarget(disc)}
                            >
                              Map to Client <ArrowUpRight size={12} />
                            </button>
                          ) : (
                            <span className="badge badge-green">
                              <CheckCircle2 size={11} /> Mapped
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 3: TEMPLATES */}
            {tab === "templates" && (
              <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
                {templates.map((tmpl) => (
                  <div key={tmpl.id} className="panel neumorph" style={{ padding: "18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span className="eyebrow">{tmpl.category || "Automation"}</span>
                      <span className="badge badge-blue">v{tmpl.version || "1.0"}</span>
                    </div>
                    <h3 style={{ margin: "8px 0 6px", fontSize: "15px" }}>{tmpl.name}</h3>
                    <p style={{ fontSize: "12px", color: "var(--muted)", margin: "0 0 14px", lineHeight: 1.5 }}>
                      {tmpl.description}
                    </p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                      <small style={{ color: "var(--muted)", font: "10px 'DM Mono', monospace" }}>
                        Industry: {tmpl.target_industry || "All industries"}
                      </small>
                      <button
                        className="action-pill"
                        onClick={() => setDeployTarget(tmpl)}
                      >
                        Deploy Template
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MAP DISCOVERED WORKFLOW MODAL */}
      {mapTarget && (
        <MapWorkflowModal
          discovered={mapTarget}
          clients={clients}
          onClose={() => setMapTarget(null)}
          onSuccess={() => {
            setMapTarget(null);
            loadData();
          }}
        />
      )}
      {deployTarget && <DeployTemplateModal template={deployTarget} clients={clients} instances={instances} onClose={() => setDeployTarget(null)} onSuccess={() => { setDeployTarget(null); void loadData(); }} />}
    </div>
  );
}

function DeployTemplateModal({ template, clients, instances, onClose, onSuccess }: { template: AutomationTemplate; clients: Client[]; instances: N8nInstance[]; onClose: () => void; onSuccess: () => void }) {
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [instanceId, setInstanceId] = useState(instances[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const deployable = !!template.default_config?.workflow_definition;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/automation-templates/${template.id}/deploy`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId, n8n_instance_id: instanceId }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Deployment failed.");
      toast.success("Workflow deployed and explicitly assigned. Activation remains controlled separately.");
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Deployment failed.");
    } finally { setBusy(false); }
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="onboarding-modal panel neumorph" onMouseDown={(event) => event.stopPropagation()} style={{ maxWidth: "520px" }}><div className="modal-head"><div><div className="eyebrow">EXPLICIT TEMPLATE DEPLOYMENT</div><h2>{template.name}</h2><p>Creates a real inactive n8n workflow, records discovery, then assigns it to the selected tenant.</p></div><button className="close-button" onClick={onClose}><X size={18} /></button></div>{!deployable ? <div className="panel neumorph error-state">This catalog entry has no workflow definition. Add a reviewed <code>workflow_definition</code> to its existing template configuration before deployment.</div> : <form onSubmit={submit}><div className="form-group"><label>Client</label><select value={clientId} onChange={(event) => setClientId(event.target.value)} required>{clients.map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}</select></div><div className="form-group"><label>Connected n8n instance</label><select value={instanceId} onChange={(event) => setInstanceId(event.target.value)} required>{instances.map((instance) => <option key={instance.id} value={instance.id}>{instance.instance_name}</option>)}</select></div><div className="modal-actions"><button type="button" className="secondary-cta" onClick={onClose}>Cancel</button><button className="primary-cta" disabled={busy || !clientId || !instanceId}>{busy ? "Deploying…" : "Deploy inactive workflow"}</button></div></form>}</div></div>;
}

function MapWorkflowModal({
  discovered,
  clients,
  onClose,
  onSuccess,
}: {
  discovered: DiscoveredWorkflow;
  clients: Client[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [clientId, setClientId] = useState<string>(clients[0]?.id || "");
  const [businessName, setBusinessName] = useState<string>(discovered.name_in_n8n || discovered.discovered_name || discovered.n8n_workflow_id);
  const [businessJob, setBusinessJob] = useState<string>("Automated lead nurturing and review collection");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/workflows/map", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discovered_id: discovered.id,
          client_id: clientId,
          business_name: businessName,
          business_job: businessJob,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Workflow mapped to ${clients.find((c) => c.id === clientId)?.company_name}`);
        onSuccess();
      } else {
        toast.error(data.error || "Mapping failed.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="onboarding-modal panel neumorph" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: "540px" }}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">
              <span className="signal" /> AUTOMATION MAPPING ENGINE
            </div>
            <h2>Map Discovered Workflow</h2>
            <p>Connect raw n8n automation node to a tenant with clean business taxonomy.</p>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="panel neumorph" style={{ padding: "12px", marginBottom: "14px" }}>
            <small className="muted">Raw n8n Workflow Name</small>
            <p style={{ margin: "2px 0 0", fontFamily: "monospace", fontSize: "12px" }}>{discovered.name_in_n8n || discovered.discovered_name || discovered.n8n_workflow_id}</p>
          </div>

          <div className="form-group">
            <label>Target Client Tenant</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Client-Facing Business Name</label>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Patient Lead Recovery Engine"
              required
            />
          </div>

          <div className="form-group">
            <label>Business Job (Function)</label>
            <input
              value={businessJob}
              onChange={(e) => setBusinessJob(e.target.value)}
              placeholder="e.g. Re-engages cold patients and syncs booking calendar"
              required
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary-cta" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="primary-cta" disabled={busy}>
              {busy ? "Mapping..." : "Confirm & Map Workflow"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
