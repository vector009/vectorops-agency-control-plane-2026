import { useState, useEffect } from "react";
import {
  ShieldCheck,
  Server,
  Lock,
  Database,
  Activity,
  CheckCircle2,
  RefreshCw,
  Terminal,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import type { AuditLog } from "@/types/vectorops";

export function SettingsView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    fetch("/api/admin/data/audit_logs", { credentials: "include" })
      .then((r) => r.json())
      .then((body) => {
        if (body.ok) setLogs(body.rows || []);
      })
      .catch(() => toast.error("Failed to load audit logs."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="settings-view">
      <div className="page-header">
        <div>
          <div className="eyebrow">
            <span className="signal" /> VECTOROPS / SYSTEM CONFIGURATION
          </div>
          <h1>System Control & Audit Ledger</h1>
          <p>3-Plane architecture posture, master credentials, encryption status, and immutable audit logs.</p>
        </div>
        <button className="soft-button" onClick={() => loadData()}>
          <RefreshCw size={15} /> Refresh Audit Trail
        </button>
      </div>

      {/* 3 Architecture Status Cards */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "24px" }}>
        <div className="panel neumorph" style={{ padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="eyebrow">PERSISTENCE POSTURE</span>
            <Database size={18} style={{ color: "var(--blue)" }} />
          </div>
          <h3 style={{ margin: "10px 0 4px", fontSize: "16px" }}>Resilience Memory Engine</h3>
          <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)", lineHeight: 1.5 }}>
            Operational memory engine active with automatic Supabase failover syncing.
          </p>
          <span className="badge badge-green" style={{ marginTop: "12px" }}>
            <ShieldCheck size={11} /> DURABLE POSTURE
          </span>
        </div>

        <div className="panel neumorph" style={{ padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="eyebrow">IDENTITY & RBAC</span>
            <Lock size={18} style={{ color: "var(--green)" }} />
          </div>
          <h3 style={{ margin: "10px 0 4px", fontSize: "16px" }}>Supabase Auth Engine</h3>
          <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)", lineHeight: 1.5 }}>
            Identity verified via Supabase Auth & <code>public.profiles</code> role verification (<code>admin</code> / <code>client</code>).
          </p>
          <span className="badge badge-green" style={{ marginTop: "12px" }}>
            <CheckCircle2 size={11} /> VERIFIED SECURE
          </span>
        </div>

        <div className="panel neumorph" style={{ padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="eyebrow">ISOLATION MODEL</span>
            <Layers size={18} style={{ color: "var(--purple)" }} />
          </div>
          <h3 style={{ margin: "10px 0 4px", fontSize: "16px" }}>3-Plane Separation</h3>
          <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)", lineHeight: 1.5 }}>
            Business (Clients/Invoices), Control (Desired States), Execution (n8n Clusters).
          </p>
          <span className="badge badge-purple" style={{ marginTop: "12px" }}>
            ZERO DRIFT ENFORCED
          </span>
        </div>
      </div>

      {/* Section 57: Audit Logs */}
      <div className="panel neumorph">
        <div className="panel-head">
          <div>
            <div className="eyebrow">
              <span className="signal" /> SECTION 57 IMMUTABLE AUDIT TRAIL
            </div>
            <h2>Security & Operational Event Log</h2>
          </div>
          <small style={{ color: "var(--muted)", font: "10px 'DM Mono', monospace" }}>
            {logs.length} logged events
          </small>
        </div>

        <table className="interactive-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action Executed</th>
              <th>Target Entity</th>
              <th>Event Payload / Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "30px" }}>Loading audit ledger...</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
                  No audit logs recorded yet.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--muted)" }}>
                    {log.created_at ? log.created_at.slice(0, 19).replace("T", " ") : "—"}
                  </td>
                  <td>
                    <span className="badge badge-blue">{log.actor_role || log.actor_user_id}</span>
                  </td>
                  <td>
                    <strong style={{ fontSize: "12px" }}>{log.action}</strong>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: "11px" }}>
                    {log.table_name} / {log.record_id || "global"}
                  </td>
                  <td style={{ fontSize: "11px", color: "var(--muted)" }}>
                    {log.metadata ? JSON.stringify(log.metadata) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
