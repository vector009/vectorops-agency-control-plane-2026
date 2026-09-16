import { useEffect, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { AuditLog } from "@/types/vectorops";
import { apiFetch as fetch } from "@/lib/api";

export function AuditView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); fetch("/api/admin/data/audit_logs", { credentials: "include" }).then((response) => response.json()).then((body) => { if (!body.ok) throw new Error(body.error); setLogs(body.rows || []); }).catch(() => toast.error("Unable to load the audit ledger.")).finally(() => setLoading(false)); };
  useEffect(load, []);
  return <div><div className="page-header"><div><div className="eyebrow"><ShieldCheck size={13} /> SECURITY LEDGER</div><h1>Audit</h1><p>Administrative and security mutations recorded separately from day-to-day activity.</p></div><button className="soft-button" onClick={load}><RefreshCw size={15} /> Refresh</button></div><div className="panel neumorph"><table className="interactive-table"><thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Target</th><th>Metadata</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="empty-cell">Loading audit ledger…</td></tr> : logs.length ? logs.map((log) => <tr key={log.id}><td>{log.created_at ? new Date(log.created_at).toLocaleString() : "—"}</td><td><span className="badge badge-blue">{log.actor_role || "system"}</span></td><td><strong>{log.action}</strong></td><td>{log.table_name} / {log.record_id || "global"}</td><td>{log.metadata ? JSON.stringify(log.metadata) : "—"}</td></tr>) : <tr><td colSpan={5} className="empty-cell">No audit entries recorded.</td></tr>}</tbody></table></div></div>;
}
