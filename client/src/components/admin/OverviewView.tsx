import { useState, useEffect } from "react";
import {
  Users,
  CircleDollarSign,
  Zap,
  Network,
  Ticket,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  ShieldCheck,
  Building2,
  ChevronRight,
  Plus,
} from "lucide-react";
import type { AttentionItem, Client } from "@/types/vectorops";
import { apiFetch as fetch } from "@/lib/api";

interface OverviewProps {
  onNavigate: (module: string) => void;
  onAddClient: () => void;
  onOpenClient: (client: Client) => void;
}

export function OverviewView({ onNavigate, onAddClient, onOpenClient }: OverviewProps) {
  const [data, setData] = useState<{
    clients: Client[];
    templates: number;
    workflows: number;
    instances: number;
    mrr: number;
    overdue: number;
    collected: number;
    financialByCurrency: Record<string, { mrr: number; outstanding: number; collected: number }>;
    healthPercent: number;
    openTickets: number;
    loading: boolean;
    attentionItems: AttentionItem[];
  }>({
    clients: [],
    templates: 0,
    workflows: 0,
    instances: 0,
    mrr: 0,
    overdue: 0,
    collected: 0,
    financialByCurrency: {},
    healthPercent: 100,
    openTickets: 0,
    loading: true,
    attentionItems: [],
  });

  const formatPortfolio = (metric: "mrr" | "outstanding" | "collected", fallback: number) => {
    const totals = Object.entries(data.financialByCurrency).filter(([, values]) => values[metric] !== 0);
    if (totals.length === 0) return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(fallback);
    return totals
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, values]) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(values[metric]))
      .join(" · ");
  };

  const loadData = () => {
    fetch("/api/admin/overview", { credentials: "include" })
      .then((res) => res.json())
      .then((body) => {
        if (body.ok) {
          setData({
            clients: body.clients || [],
            templates: body.templates || 0,
            workflows: body.workflows || 0,
            instances: body.instances || 0,
            mrr: body.mrr || 0,
            overdue: body.overdue || 0,
            collected: body.collected || 0,
            financialByCurrency: body.financialByCurrency || {},
            healthPercent: Number.isFinite(body.healthPercent) ? body.healthPercent : 100,
            openTickets: body.openTickets || 0,
            loading: false,
            attentionItems: body.attentionItems || [],
          });
        }
      })
      .catch(() => {
        setData((prev) => ({ ...prev, loading: false }));
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeClients = data.clients.filter((c) => c.status === "active");

  return (
    <div className="overview-container">
      {/* Top Header */}
      <div className="page-header">
        <div>
          <div className="eyebrow">
            <span className="signal" /> VECTOROPS / OPERATIONAL MEMORY ENGINE
          </div>
          <h1>Good morning, operator.</h1>
          <p>Complete executive control over client relationships, recurring revenue, and automation telemetry.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="primary-cta" onClick={onAddClient}>
            <Plus size={16} /> Onboard New Tenant
          </button>
        </div>
      </div>

      {/* 8 Primary KPIs */}
      <div className="stat-grid">
        <div className="stat neumorph">
          <div className="stat-top">
            <span>MONTHLY RECURRING REVENUE</span>
            <CircleDollarSign size={18} />
          </div>
          <strong className="portfolio-money">{data.loading ? "..." : formatPortfolio("mrr", data.mrr)}</strong>
          <small>{activeClients.length} active subscription retainers</small>
        </div>

        <div className="stat neumorph">
          <div className="stat-top">
            <span>COLLECTED REVENUE</span>
            <TrendingUp size={18} style={{ color: "var(--green)" }} />
          </div>
          <strong className="portfolio-money">{data.loading ? "..." : formatPortfolio("collected", data.collected)}</strong>
          <small>Verified payments received</small>
        </div>

        <div className={`stat neumorph ${data.overdue > 0 ? "amber" : ""}`}>
          <div className="stat-top">
            <span>OUTSTANDING REVENUE</span>
            <AlertTriangle size={18} style={{ color: data.overdue > 0 ? "var(--amber)" : "var(--muted)" }} />
          </div>
          <strong className="portfolio-money">{data.loading ? "..." : formatPortfolio("outstanding", data.overdue)}</strong>
          <small>Due and pending partial balances</small>
        </div>

        <div className="stat neumorph">
          <div className="stat-top">
            <span>ACTIVE CLIENTS</span>
            <Users size={18} style={{ color: "var(--blue)" }} />
          </div>
          <strong>{data.loading ? "..." : String(activeClients.length)}</strong>
          <small>{data.clients.length} total registered tenants</small>
        </div>

        <div className="stat neumorph">
          <div className="stat-top">
            <span>ACTIVE AUTOMATIONS</span>
            <Zap size={18} style={{ color: "var(--purple)" }} />
          </div>
          <strong>{data.loading ? "..." : String(data.workflows)}</strong>
          <small>{data.templates} reusable templates catalogued</small>
        </div>

        <div className="stat neumorph">
          <div className="stat-top">
            <span>INFRASTRUCTURE NODES</span>
            <Network size={18} style={{ color: "var(--blue)" }} />
          </div>
          <strong>{data.loading ? "..." : String(data.instances)}</strong>
          <small>n8n execution clusters online</small>
        </div>

        <div className="stat neumorph">
          <div className="stat-top">
            <span>SUPPORT QUEUE</span>
            <Ticket size={18} style={{ color: "var(--amber)" }} />
          </div>
          <strong>{data.loading ? "..." : String(data.openTickets)}</strong>
          <small>Open tickets requiring review</small>
        </div>

        <div className="stat neumorph">
          <div className="stat-top">
            <span>EXECUTION HEALTH</span>
            <CheckCircle2 size={18} style={{ color: "var(--green)" }} />
          </div>
          <strong>{data.loading ? "..." : `${data.healthPercent}%`}</strong>
          <small>Workflows with synchronized actual state</small>
        </div>
      </div>

      {/* Main Content Split: Attention Engine & Client Health */}
      <div className="content-grid" style={{ marginBottom: "24px" }}>
        {/* Section 48 Attention Engine */}
        <div className="panel neumorph">
          <div className="panel-head">
            <div>
              <div className="eyebrow">
                <span className="status-dot amber" /> ATTENTION ENGINE / LIVE POSTURE
              </div>
              <h2>What needs operator attention</h2>
            </div>
            <span className="attention-count">{data.attentionItems.length} items</span>
          </div>

          <div className="attention-list">
            {data.attentionItems.map((item) => (
              <div key={item.id} className="attention-row">
                <span className={`status-dot ${item.tone}`} />
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </div>
                {item.targetModule && (
                  <button
                    className="action-pill"
                    onClick={() => onNavigate(item.targetModule!)}
                  >
                    {item.actionLabel || "Review"} <ArrowUpRight size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Client Health Radar */}
        <div className="panel neumorph">
          <div className="panel-head">
            <div>
              <div className="eyebrow">RELATIONSHIP SURFACE</div>
              <h2>Client health & retainers</h2>
            </div>
            <button className="panel-action" onClick={() => onNavigate("Clients")}>
              View all ({data.clients.length}) <ChevronRight size={14} />
            </button>
          </div>

          <div className="client-list">
            {data.clients.slice(0, 5).map((client) => (
              <div
                key={client.id}
                className="client-row"
                style={{ cursor: "pointer" }}
                onClick={() => onOpenClient(client)}
              >
                <div className="client-initial">
                  {client.company_name.slice(0, 2).toUpperCase()}
                </div>
                <div className="client-meta">
                  <strong>{client.company_name}</strong>
                  <small>{client.contact_name || client.email || "No contact"}</small>
                </div>
                <span className={`badge badge-${client.status === "active" ? "green" : client.status === "paused" ? "amber" : "muted"}`}>
                  {client.status}
                </span>
                <ChevronRight size={14} className="muted" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lower Grid: Revenue Momentum & Control Plane Posture */}
      <div className="lower-grid">
        <div className="panel neumorph compact-panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">FINANCIAL PLANE</div>
              <h2>Monthly billing consolidation</h2>
            </div>
            <button className="panel-action" onClick={() => onNavigate("Money")}>
              Money & Invoices <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="metric-card-group" style={{ marginBottom: 0 }}>
            <div className="metric-box"><span>MRR</span><strong>{formatPortfolio("mrr", data.mrr)}</strong></div>
            <div className="metric-box"><span>Collected</span><strong>{formatPortfolio("collected", data.collected)}</strong></div>
            <div className="metric-box"><span>Outstanding</span><strong>{formatPortfolio("outstanding", data.overdue)}</strong></div>
          </div>
        </div>

        <div className="panel neumorph compact-panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">CONTROL PLANE HEALTH</div>
              <h2>State synchronization posture</h2>
            </div>
            <button className="panel-action" onClick={() => onNavigate("Automations")}>
              Automations <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="connection-line" style={{ marginTop: "14px" }}>
            <div className="connection-icon">
              <Zap size={20} />
            </div>
            <div>
              <strong>{data.workflows} automations monitored across {data.instances} n8n nodes</strong>
              <small>{data.healthPercent === 100 ? "No state drift detected between desired and actual execution planes." : "One or more workflows are pending synchronization or need review."}</small>
            </div>
            <span className={`badge badge-${data.healthPercent === 100 ? "green" : "amber"}`}>
              <ShieldCheck size={12} /> {data.healthPercent === 100 ? "IN SYNC" : "REVIEW"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
