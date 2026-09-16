import { useState, useEffect } from "react";
import {
  CalendarDays,
  Plus,
  ArrowUpRight,
  Clock,
  Building2,
  X,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { CalendarEvent, Client } from "@/types/vectorops";
import { apiFetch as fetch } from "@/lib/api";

export function CalendarView() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/data/calendar_events", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/data/clients", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([evRes, cliRes]) => {
        if (evRes.ok) setEvents(evRes.rows || []);
        if (cliRes.ok) setClients(cliRes.rows || []);
      })
      .catch(() => toast.error("Failed to load events."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const clientMap = new Map<string, string>();
  clients.forEach((c) => clientMap.set(c.id, c.company_name));

  return (
    <div className="calendar-view">
      <div className="page-header">
        <div>
          <div className="eyebrow">
            <span className="signal" /> VECTOROPS / OPERATIONAL SCHEDULE
          </div>
          <h1>Calendar & Schedule</h1>
          <p>Upcoming invoice due dates, subscription renewals, client syncs, and system maintenance.</p>
        </div>
        <button className="primary-cta" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Add Event
        </button>
      </div>

      <div className="panel neumorph">
        <table className="interactive-table">
          <thead>
            <tr>
              <th>Event Title</th>
              <th>Client</th>
              <th>Event Type</th>
              <th>Starts At</th>
              <th>Ends At</th>
              <th>Location / Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "30px" }}>Loading schedule...</td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
                  No upcoming calendar events.
                </td>
              </tr>
            ) : (
              events.map((ev) => (
                <tr key={ev.id}>
                  <td>
                    <strong>{ev.title}</strong>
                    {(ev.description || ev.notes) && <small style={{ display: "block", color: "var(--muted)" }}>{ev.description || ev.notes}</small>}
                  </td>
                  <td>{ev.client_id ? clientMap.get(ev.client_id) || ev.client_id : "Global / Agency"}</td>
                  <td>
                    <span
                      className={`badge badge-${
                        ev.event_type === "renewal"
                          ? "green"
                          : ev.event_type === "meeting"
                          ? "blue"
                          : "purple"
                      }`}
                    >
                      {ev.event_type.replace("_", " ")}
                    </span>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: "11px" }}>
                    {ev.starts_at ? ev.starts_at.slice(0, 16).replace("T", " ") : "—"}
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--muted)" }}>
                    {ev.ends_at ? ev.ends_at.slice(0, 16).replace("T", " ") : "—"}
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: "11px" }}>{ev.location || "Remote / Cloud"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <CreateEventModal
          clients={clients}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

function CreateEventModal({
  clients,
  onClose,
  onSuccess,
}: {
  clients: Client[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [type, setType] = useState<CalendarEvent["event_type"]>("meeting");
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 16));
  const [endsAt, setEndsAt] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/data/calendar_events", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          client_id: clientId || null,
          event_type: type,
          starts_at: startsAt,
          ends_at: endsAt,
          notes,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Calendar event created.");
        onSuccess();
      } else {
        toast.error(data.error || "Creation failed.");
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
              <span className="signal" /> SCHEDULE / WRITE ACTION
            </div>
            <h2>Create Calendar Event</h2>
            <p>Add a renewal window, invoice target, or client meeting.</p>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Event Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Q4 Growth Review" required />
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>Event Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as any)}>
                <option value="meeting">Client Meeting</option>
                <option value="call">Client Call</option>
                <option value="onboarding">Onboarding Milestone</option>
                <option value="renewal">Retainer Renewal</option>
                <option value="internal">Internal / Maintenance</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="form-group">
              <label>Associated Client</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Global / Agency Wide</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>Starts At</label>
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Ends At</label>
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
            </div>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Review quarterly metrics and upsell review automations" />
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary-cta" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="primary-cta" disabled={busy}>
              {busy ? "Saving..." : "Add Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
