import { useState, useEffect, useMemo } from "react";
import {
  Ticket,
  Search,
  Plus,
  AlertCircle,
  Clock,
  CheckCircle2,
  Lock,
  X,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import type { SupportTicket, Client } from "@/types/vectorops";
import { apiFetch as fetch } from "@/lib/api";

export function SupportView() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [internalNotes, setInternalNotes] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/data/support_tickets", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/data/clients", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([tktRes, cliRes]) => {
        if (tktRes.ok) setTickets(tktRes.rows || []);
        if (cliRes.ok) setClients(cliRes.rows || []);
      })
      .catch(() => toast.error("Failed to load tickets."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const clientMap = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => map.set(c.id, c.company_name));
    return map;
  }, [clients]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const matchSearch =
        t.subject.toLowerCase().includes(search.toLowerCase()) ||
        t.ticket_number.toLowerCase().includes(search.toLowerCase()) ||
        (clientMap.get(t.client_id) || "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [tickets, search, statusFilter, clientMap]);

  const openTicket = (t: SupportTicket) => {
    setActiveTicket(t);
    setInternalNotes("");
    setReply("");
  };

  const handleUpdateTicketStatus = async (nextStatus: SupportTicket["status"], closeAfter = false) => {
    if (!activeTicket) return;
    try {
      const response = await fetch(`/api/admin/support-tickets/${activeTicket.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, priority: activeTicket.priority, internal_notes: internalNotes }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Ticket update failed.");
      const updated = { ...activeTicket, ...result.ticket, status: nextStatus, internal_notes: internalNotes ? [activeTicket.internal_notes, internalNotes].filter(Boolean).join("\n\n") : activeTicket.internal_notes };
      setTickets((prev) => prev.map((ticket) => ticket.id === activeTicket.id ? updated : ticket));
      setActiveTicket(closeAfter ? null : updated);
      setInternalNotes("");
      toast.success(`Ticket marked as ${nextStatus.replace("_", " ")}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ticket update failed.");
    }
  };

  const handleReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeTicket || !reply.trim()) return;
    setSending(true);
    try {
      const response = await fetch(`/api/admin/support-tickets/${activeTicket.id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply.trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Reply failed.");
      const updated = { ...activeTicket, status: "pending_client" as const, messages: [...(activeTicket.messages || []), result.message] };
      setActiveTicket(updated);
      setTickets((current) => current.map((ticket) => ticket.id === updated.id ? updated : ticket));
      setReply("");
      toast.success("Client-visible reply sent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reply failed.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="support-view">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="eyebrow">
            <span className="signal" /> VECTOROPS / SUPPORT & OPERATIONS PLANE
          </div>
          <h1>Support Desk & Requests</h1>
          <p>Client issue escalation, triage tickets, and confidential operator notes.</p>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="filter-bar">
        <div className="filter-search">
          <Search size={16} className="muted" />
          <input
            placeholder="Search tickets by number, subject, or client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="tab-group" style={{ marginBottom: 0 }}>
          {["all", "open", "pending_admin", "pending_client", "resolved", "closed"].map((st) => (
            <button
              key={st}
              className={`tab-btn ${statusFilter === st ? "active" : ""}`}
              onClick={() => setStatusFilter(st)}
            >
              {st.replace("_", " ").toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket List */}
      <div className="panel neumorph">
        <table className="interactive-table">
          <thead>
            <tr>
              <th>Ticket # & Subject</th>
              <th>Client</th>
              <th>Category</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "30px" }}>Loading tickets...</td>
              </tr>
            ) : filteredTickets.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
                  No tickets found.
                </td>
              </tr>
            ) : (
              filteredTickets.map((t) => (
                <tr key={t.id} onClick={() => openTicket(t)}>
                  <td>
                    <strong>{t.subject}</strong>
                    <small style={{ color: "var(--blue)", fontFamily: "monospace", display: "block" }}>
                      {t.ticket_number}
                    </small>
                  </td>
                  <td>{clientMap.get(t.client_id) || t.client_id}</td>
                  <td>{t.category}</td>
                  <td>
                    <span
                      className={`badge badge-${
                        t.priority === "urgent" || t.priority === "high" ? "red" : "amber"
                      }`}
                    >
                      {t.priority}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge badge-${
                        t.status === "open"
                          ? "amber"
                          : t.status === "pending_admin"
                          ? "blue"
                          : "green"
                      }`}
                    >
                      {t.status.replace("_", " ")}
                    </span>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--muted)" }}>
                    {t.created_at.slice(0, 10)}
                  </td>
                  <td>
                    <button className="action-pill" onClick={() => openTicket(t)}>
                      Manage Ticket
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Ticket Detail Drawer */}
      {activeTicket && (
        <div className="modal-backdrop" onMouseDown={() => setActiveTicket(null)}>
          <div className="detail-drawer panel neumorph" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: "680px" }}>
            <div className="drawer-header">
              <div>
                <div className="eyebrow">
                  <span className="signal" /> TICKET {activeTicket.ticket_number} / {activeTicket.category}
                </div>
                <h2>{activeTicket.subject}</h2>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
                  <span className={`badge badge-${activeTicket.priority === "urgent" ? "red" : "amber"}`}>
                    {activeTicket.priority.toUpperCase()} PRIORITY
                  </span>
                  <small style={{ color: "var(--muted)", font: "10px 'DM Mono', monospace" }}>
                    Client: {clientMap.get(activeTicket.client_id)}
                  </small>
                </div>
              </div>
              <button className="close-button" onClick={() => setActiveTicket(null)}>
                <X size={18} />
              </button>
            </div>

            {/* Description */}
            <div className="panel neumorph" style={{ padding: "16px", marginBottom: "16px" }}>
              <span className="eyebrow">CLIENT INQUIRY / ISSUE DESCRIPTION</span>
              <p style={{ margin: "8px 0 0", fontSize: "13px", lineHeight: 1.6 }}>{activeTicket.description}</p>
            </div>

            <div className="panel neumorph" style={{ padding: "16px", marginBottom: "16px" }}>
              <span className="eyebrow">CLIENT-VISIBLE CONVERSATION</span>
              <div className="conversation-thread" style={{ marginTop: "12px" }}>
                {(activeTicket.messages || []).map((message, index) => (
                  <div className="conversation-message operator" key={message.id || index}>
                    <div><strong>{message.sender_user_id ? "Participant" : "System"}</strong><time>{new Date(message.created_at).toLocaleString()}</time></div>
                    <p>{message.message}</p>
                  </div>
                ))}
                {!(activeTicket.messages || []).length && <div className="empty-cell">No conversation messages are available.</div>}
              </div>
              {activeTicket.status !== "closed" && (
                <form onSubmit={handleReply} className="conversation-reply" style={{ marginTop: "12px" }}>
                  <label>Reply to client</label>
                  <textarea rows={3} value={reply} onChange={(event) => setReply(event.target.value)} maxLength={5000} required />
                  <button className="primary-cta" disabled={sending}><MessageSquare size={14} /> {sending ? "Sending…" : "Send visible reply"}</button>
                </form>
              )}
            </div>

            {/* Section 56: Confidential Internal Operator Notes */}
            <div
              className="panel neumorph"
              style={{
                padding: "16px",
                marginBottom: "20px",
                border: "1px solid color-mix(in srgb, var(--amber) 40%, transparent)",
                background: "color-mix(in srgb, var(--amber) 4%, var(--surface))",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--amber)", marginBottom: "8px" }}>
                <Lock size={14} />
                <span className="eyebrow" style={{ color: "var(--amber)" }}>
                  CONFIDENTIAL INTERNAL NOTES (SECTION 56 — NEVER SHOWN TO CLIENT)
                </span>
              </div>
              <textarea
                rows={3}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Add a new private operator note…"
                style={{
                  width: "100%",
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: "8px",
                  padding: "10px",
                  fontSize: "12px",
                  color: "var(--ink)",
                }}
              />
              {activeTicket.internal_notes && <div style={{ marginTop: "10px", whiteSpace: "pre-wrap", color: "var(--muted)", fontSize: "11px" }}><strong style={{ color: "var(--ink)" }}>Previous internal notes</strong><br />{activeTicket.internal_notes}</div>}
            </div>

            {/* Status Transition Actions */}
            <div className="form-row-2" style={{ marginBottom: "16px" }}>
              <label className="form-group">Priority
                <select value={activeTicket.priority} onChange={(event) => setActiveTicket({ ...activeTicket, priority: event.target.value as SupportTicket["priority"] })}>
                  <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
                </select>
              </label>
              <button className="secondary-cta" type="button" onClick={async () => {
                const response = await fetch(`/api/admin/support-tickets/${activeTicket.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: activeTicket.status, priority: activeTicket.priority, internal_notes: internalNotes, assign_to_me: true }) });
                const result = await response.json();
                if (response.ok && result.ok) { const updated = { ...activeTicket, ...result.ticket, internal_notes: internalNotes ? [activeTicket.internal_notes, internalNotes].filter(Boolean).join("\n\n") : activeTicket.internal_notes }; setActiveTicket(updated); setTickets((current) => current.map((ticket) => ticket.id === updated.id ? updated : ticket)); setInternalNotes(""); toast.success("Ticket assigned to you."); } else toast.error(result.error || "Assignment failed.");
              }}>Assign to me</button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
              <span style={{ fontSize: "11px", color: "var(--muted)", font: "10px 'DM Mono', monospace" }}>
                Current Status: <strong>{activeTicket.status.toUpperCase()}</strong>
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                {activeTicket.status !== "pending_admin" && (
                  <button className="action-pill" onClick={() => handleUpdateTicketStatus("pending_admin")}>
                    Mark Pending Admin
                  </button>
                )}
                {activeTicket.status !== "resolved" && (
                  <button
                    className="action-pill"
                    style={{ color: "var(--green)" }}
                    onClick={() => handleUpdateTicketStatus("resolved")}
                  >
                    Resolve Ticket
                  </button>
                )}
                {activeTicket.status !== "closed" && <button className="action-pill danger" onClick={() => handleUpdateTicketStatus("closed")}>Close Ticket</button>}
                <button className="primary-cta" onClick={() => handleUpdateTicketStatus(activeTicket.status, true)}>
                  Save & Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
