import { useState, useEffect } from "react";
import {
  Network,
  Server,
  Activity,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Plus,
  Radio,
  ExternalLink,
  KeyRound,
  Coins,
  Cpu,
} from "lucide-react";
import { toast } from "sonner";
import type { N8nInstance, ProviderBalance, CredentialMeta } from "@/types/vectorops";
import { apiFetch as fetch } from "@/lib/api";

export function InfrastructureView() {
  const [tab, setTab] = useState<"instances" | "providers" | "credentials">("instances");
  const [instances, setInstances] = useState<N8nInstance[]>([]);
  const [providers, setProviders] = useState<ProviderBalance[]>([]);
  const [credentials, setCredentials] = useState<CredentialMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/data/n8n_instances", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/data/provider_balances", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/data/credentials", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([instRes, provRes, credRes]) => {
        if (instRes.ok) setInstances(instRes.rows || []);
        if (provRes.ok) setProviders(provRes.rows || []);
        if (credRes.ok) setCredentials(credRes.rows || []);
      })
      .catch(() => toast.error("Failed to load infrastructure."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const verifyInstance = async (id: string) => {
    setVerifyingId(id);
    try {
      const res = await fetch(`/api/admin/n8n-instances/${id}/verify`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        const discovered = data.result?.workflowsDiscovered;
        toast.success(discovered === undefined ? "n8n connection verified." : `n8n verified · ${discovered} workflow(s) discovered.`);
        loadData();
      } else {
        toast.error(data.error || "Instance verification failed.");
      }
    } catch {
      toast.error("Network verification error.");
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="infrastructure-view">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="eyebrow">
            <span className="signal" /> VECTOROPS / EXECUTION PLANE
          </div>
          <h1>Infrastructure & Clusters</h1>
          <p>Execution health of n8n server instances, third-party provider balances, and encrypted credential refs.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="soft-button" onClick={() => loadData()}>
            <RefreshCw size={15} /> Refresh Telemetry
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-group">
        <button
          className={`tab-btn ${tab === "instances" ? "active" : ""}`}
          onClick={() => setTab("instances")}
        >
          N8N INSTANCE CLUSTERS ({instances.length})
        </button>
        <button
          className={`tab-btn ${tab === "providers" ? "active" : ""}`}
          onClick={() => setTab("providers")}
        >
          PROVIDER BALANCES ({providers.length})
        </button>
        <button
          className={`tab-btn ${tab === "credentials" ? "active" : ""}`}
          onClick={() => setTab("credentials")}
        >
          CREDENTIAL REFS & VAULT ({credentials.length})
        </button>
      </div>

      {/* Tab 1: Instances */}
      {tab === "instances" && (
        <div className="panel neumorph">
          <table className="interactive-table">
            <thead>
              <tr>
                <th>Instance Name</th>
                <th>Hosting Model</th>
                <th>Base URL</th>
                <th>Workflows</th>
                <th>Status</th>
                <th>Last Heartbeat</th>
                <th>Health Check</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((inst) => (
                <tr key={inst.id}>
                  <td>
                    <strong>{inst.instance_name}</strong>
                    <small style={{ display: "block", color: "var(--muted)", fontFamily: "monospace" }}>
                      {inst.id}
                    </small>
                  </td>
                  <td>
                    <span className="badge badge-muted" style={{ textTransform: "capitalize" }}>
                      {inst.hosting_type}
                    </span>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: "11px" }}>{inst.base_url}</td>
                  <td>{inst.workflow_count ?? 0} active</td>
                  <td>
                    <span className={`badge badge-${inst.status === "active" ? "green" : "red"}`}>
                      {inst.status}
                    </span>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--muted)" }}>
                    {inst.last_verified_at ? inst.last_verified_at.slice(0, 19).replace("T", " ") : "Never"}
                  </td>
                  <td>
                    <button
                      className="action-pill"
                      onClick={() => verifyInstance(inst.id)}
                      disabled={verifyingId === inst.id}
                    >
                      <Activity size={12} />
                      {verifyingId === inst.id ? "Pinging..." : "Test Connection"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Provider Balances */}
      {tab === "providers" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "20px" }}>
            {providers.map((prov) => {
              const balance = prov.current_balance ?? prov.balance;
              const threshold = prov.alert_threshold ?? prov.threshold;
              const providerName = prov.provider || prov.provider_name;
              const checkedAt = prov.last_checked_at || prov.checked_at;
              const isLow = balance <= threshold;
              return (
                <div
                  key={prov.id}
                  className={`panel neumorph ${isLow ? "amber" : ""}`}
                  style={{ padding: "20px", border: isLow ? "1px solid var(--amber)" : "1px solid var(--line)" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span className="eyebrow">{prov.category || prov.account_name || "Provider account"}</span>
                    <span className={`badge badge-${isLow ? "amber" : "green"}`}>
                      {isLow ? "LOW BALANCE" : "HEALTHY"}
                    </span>
                  </div>
                  <h3 style={{ margin: "10px 0 4px", fontSize: "18px" }}>{providerName}</h3>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "12px 0 6px" }}>
                    <strong style={{ fontSize: "28px", color: isLow ? "var(--amber)" : "inherit" }}>
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: prov.currency }).format(balance)}
                    </strong>
                    <small style={{ color: "var(--muted)", font: "10px 'DM Mono', monospace" }}>
                      Alert threshold: {new Intl.NumberFormat("en-US", { style: "currency", currency: prov.currency }).format(threshold)}
                    </small>
                  </div>
                  <small style={{ color: "var(--muted)", display: "block", font: "9px 'DM Mono', monospace" }}>
                    Last synchronized: {checkedAt.slice(0, 19).replace("T", " ")}
                  </small>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Credentials */}
      {tab === "credentials" && (
        <div className="panel neumorph">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", color: "var(--muted)", fontSize: "11px", display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldCheck size={16} style={{ color: "var(--green)" }} />
            Encrypted Vault Architecture: Plaintext API keys and secrets are never returned to the frontend.
          </div>
          <table className="interactive-table">
            <thead>
              <tr>
                <th>Service Name</th>
                <th>Vault Secret Reference</th>
                <th>Status</th>
                <th>Expiration</th>
                <th>Last Authenticated</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map((cred) => (
                <tr key={cred.id}>
                  <td>
                    <strong>{cred.service_name || cred.credential_name}</strong>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--blue)" }}>
                    {cred.vault_secret_ref}
                  </td>
                  <td>
                    <span className={`badge badge-${cred.active && cred.status !== "expired" ? "green" : "amber"}`}>
                      {cred.status || (cred.active ? "active" : "inactive")}
                    </span>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--muted)" }}>
                    {cred.expires_at || "Never expires"}
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--muted)" }}>
                    {cred.last_used_at ? cred.last_used_at.slice(0, 19).replace("T", " ") : "Not recorded"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
