import { useState, useEffect, useMemo } from "react";
import {
  CheckCircle2,
  Circle,
  Plus,
  Clock,
  AlertCircle,
  X,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import type { Task, Client } from "@/types/vectorops";
import { apiFetch as fetch } from "@/lib/api";

export function TasksView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/data/tasks", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/data/clients", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([tskRes, cliRes]) => {
        if (tskRes.ok) setTasks(tskRes.rows || []);
        if (cliRes.ok) setClients(cliRes.rows || []);
      })
      .catch(() => toast.error("Failed to load tasks."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const clientMap = new Map<string, string>();
  clients.forEach((c) => clientMap.set(c.id, c.company_name));

  const toggleTask = async (task: Task) => {
    const nextStatus: Task["status"] = task.status === "completed" ? "todo" : task.status === "todo" ? "in_progress" : "completed";
    try {
      const response = await fetch(`/api/admin/tasks/${task.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Task update failed.");
      setTasks((prev) => prev.map((item) => item.id === task.id ? { ...item, ...result.task } : item));
      toast.success(`Task marked as ${nextStatus.replace("_", " ")}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Task update failed.");
    }
  };

  const filteredTasks = useMemo(() => {
    if (statusFilter === "all") return tasks;
    return tasks.filter((t) => t.status === statusFilter);
  }, [tasks, statusFilter]);

  return (
    <div className="tasks-view">
      <div className="page-header">
        <div>
          <div className="eyebrow">
            <span className="signal" /> VECTOROPS / INTERNAL EXECUTION
          </div>
          <h1>Operational Tasks</h1>
          <p>Internal agency action items, webhook migrations, and client onboarding milestones.</p>
        </div>
        <button className="primary-cta" onClick={() => setShowModal(true)}>
          <Plus size={16} /> New Task
        </button>
      </div>

      <div className="tab-group">
        {["all", "todo", "in_progress", "blocked", "completed", "cancelled"].map((s) => (
          <button
            key={s}
            className={`tab-btn ${statusFilter === s ? "active" : ""}`}
            onClick={() => setStatusFilter(s)}
          >
            {s.replace("_", " ").toUpperCase()}
          </button>
        ))}
      </div>

      <div className="panel neumorph">
        <table className="interactive-table">
          <thead>
            <tr>
              <th style={{ width: "40px" }}></th>
              <th>Task Title & Scope</th>
              <th>Client</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "30px" }}>Loading tasks...</td>
              </tr>
            ) : filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
                  No tasks under this filter.
                </td>
              </tr>
            ) : (
              filteredTasks.map((t) => (
                <tr key={t.id} onClick={() => toggleTask(t)}>
                  <td>
                    <button
                      style={{ background: "transparent", border: 0, color: t.status === "completed" ? "var(--green)" : "var(--muted)" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTask(t);
                      }}
                    >
                      {t.status === "completed" ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    </button>
                  </td>
                  <td>
                    <strong style={{ textDecoration: t.status === "completed" ? "line-through" : "none", color: t.status === "completed" ? "var(--muted)" : "inherit" }}>
                      {t.title}
                    </strong>
                    {t.description && <small style={{ display: "block", color: "var(--muted)" }}>{t.description}</small>}
                  </td>
                  <td>{t.client_id ? clientMap.get(t.client_id) || t.client_id : "Agency Internal"}</td>
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
                        t.status === "completed" ? "green" : t.status === "in_progress" ? "blue" : t.status === "blocked" ? "red" : "muted"
                      }`}
                    >
                      {t.status.replace("_", " ")}
                    </span>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--muted)" }}>
                    {t.due_at ? t.due_at.slice(0, 10) : "No due date"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <CreateTaskModal
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

function CreateTaskModal({
  clients,
  onClose,
  onSuccess,
}: {
  clients: Client[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/data/tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          client_id: clientId || null,
          priority,
          due_at: dueAt || null,
          status: "todo",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Task created.");
        onSuccess();
      } else {
        toast.error(data.error || "Failed to create task.");
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
              <span className="signal" /> TASKS / WRITE ACTION
            </div>
            <h2>Create Operational Task</h2>
            <p>Assign work item to agency sprint or client onboarding pipeline.</p>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Task Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Review WhatsApp webhook payload schema" required />
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>Client</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Agency Internal</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Due Date</label>
            <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>

          <div className="form-group">
            <label>Details</label>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary-cta" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="primary-cta" disabled={busy}>
              {busy ? "Saving..." : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
