import { useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiFetch as fetch } from "@/lib/api";

type ActivityRow = { id: string; kind: string; title: string; detail: string; occurred_at: string };

export function ActivityView() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/data/business_events", { credentials: "include" }).then((response) => response.json()),
      fetch("/api/admin/data/automation_logs", { credentials: "include" }).then((response) => response.json()),
    ]).then(([events, logs]) => {
      const business = (events.rows || []).map((row: Record<string, unknown>) => ({ id: String(row.id), kind: "Business event", title: String(row.event_type || "Event"), detail: row.event_value == null ? "Recorded" : `Value: ${row.event_value}`, occurred_at: String(row.occurred_at || row.created_at || "") }));
      const automation = (logs.rows || []).map((row: Record<string, unknown>) => ({ id: String(row.id), kind: "Automation", title: String(row.event_type || row.level || "Automation log"), detail: String(row.message || row.workflow_id || "Recorded"), occurred_at: String(row.created_at || "") }));
      setRows([...business, ...automation].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)));
    }).catch(() => toast.error("Unable to load operational activity.")).finally(() => setLoading(false));
  };
  useEffect(load, []);
  return <div><div className="page-header"><div><div className="eyebrow"><span className="signal" /> OPERATIONS TIMELINE</div><h1>Activity</h1><p>Business and automation events in chronological order. This is operational activity, not the security audit ledger.</p></div><button className="soft-button" onClick={load}><RefreshCw size={15} /> Refresh</button></div><div className="panel neumorph"><div className="activity-timeline">{loading ? <div className="empty-cell">Loading activity…</div> : rows.length ? rows.map((row) => <article key={`${row.kind}-${row.id}`}><Activity size={14} /><div><span className="eyebrow">{row.kind}</span><strong>{row.title}</strong><p>{row.detail}</p></div><time>{row.occurred_at ? new Date(row.occurred_at).toLocaleString() : "—"}</time></article>) : <div className="empty-cell">No operational activity has been recorded.</div>}</div></div></div>;
}
