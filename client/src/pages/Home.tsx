import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Command,
  Database,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  Network,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Ticket,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import type { Client } from "@/types/vectorops";
import { OverviewView } from "@/components/admin/OverviewView";
import { ClientsView } from "@/components/admin/ClientsView";
import { MoneyView } from "@/components/admin/MoneyView";
import { AutomationsView } from "@/components/admin/AutomationsView";
import { InfrastructureView } from "@/components/admin/InfrastructureView";
import { SupportView } from "@/components/admin/SupportView";
import { CalendarView } from "@/components/admin/CalendarView";
import { TasksView } from "@/components/admin/TasksView";
import { SettingsView } from "@/components/admin/SettingsView";
import { ActivityView } from "@/components/admin/ActivityView";
import { AuditView } from "@/components/admin/AuditView";
import { OnboardingWizard } from "@/components/admin/OnboardingWizard";
import { edgeApiUrl, supabaseConfigured } from "@/lib/supabase";
import { apiFetch as fetch, getCurrentUser, signInForRole, signOut } from "@/lib/api";

const nav = [
  ["Overview", LayoutDashboard],
  ["Businesses", Users],
  ["Automations", Zap],
  ["Money", CircleDollarSign],
  ["Calendar", CalendarDays],
  ["Tasks", Check],
  ["Support", Ticket],
  ["Infrastructure", Network],
  ["Activity", Activity],
  ["Audit", ShieldCheck],
  ["Settings", Settings2],
] as const;

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button className="icon-button" onClick={toggleTheme} aria-label="Toggle day and night mode">
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <div className="brand-mark">
        <span />
        <span />
        <span />
      </div>
      {!compact && (
        <div>
          <div className="brand-name">
            VECTOR<span>OPS</span>
          </div>
          <div className="brand-sub">Agency operating system</div>
        </div>
      )}
    </div>
  );
}

function StatusDot({ tone = "green" }: { tone?: string }) {
  return <span className={`status-dot ${tone}`} />;
}

export function Home({ onAdmin, onClient }: { onAdmin: () => void; onClient: () => void }) {
  return (
    <div className="entry-page">
      <header className="entry-nav">
        <Brand />
        <div className="entry-actions">
          <span className="eyebrow hide-mobile">
            <StatusDot /> SYSTEM READY · 3-PLANE ACTIVE
          </span>
          <ThemeToggle />
          <button className="text-button" onClick={onClient} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            Business portal <ArrowUpRight size={15} />
          </button>
        </div>
      </header>
      <main className="entry-main">
        <section className="hero-copy">
          <div className="eyebrow">
            <span className="signal" /> CONTROL PLANE / 01 · ENTERPRISE AGENT OS
          </div>
          <h1>
            Your agency,
            <br />
            <em>under one</em> operating system.
          </h1>
          <p className="hero-lede">
            Manage the business plane, automation control plane, and execution health from one unified command center.
          </p>
          <div className="hero-actions">
            <Button className="primary-cta" onClick={onAdmin} id="btn-login-operator">
              <LockKeyhole size={16} /> Log in as operator <ChevronRight size={16} />
            </Button>
            <button className="secondary-cta" onClick={onClient} id="btn-login-business">
              Log in as business <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="trust-row">
            <ShieldCheck size={16} />
            <span>Signed session security</span>
            <span className="separator" />
            <span>Multi-tenant isolated</span>
            <span className="separator" />
            <span>Audit ready</span>
          </div>
        </section>
        <section className="system-visual">
          <div className="visual-header">
            <span>VECTOROPS / THREE-PLANE ARCHITECTURE</span>
            <span className="live-pill">
              <StatusDot /> OPERATIONAL
            </span>
          </div>
          <div className="orbit">
            <div className="orbit-ring ring-one" />
            <div className="orbit-ring ring-two" />
            <div className="core">
              <div className="core-grid">
                <Command size={25} />
                <span>OPS</span>
              </div>
              <small>OPERATOR CORE</small>
            </div>
            {[
              ["BUSINESS", "01", "top"],
              ["CONTROL", "02", "right"],
              ["EXECUTION", "03", "bottom"],
              ["BUSINESS PORTAL", "04", "left"],
            ].map(([name, no, pos]) => (
              <div className={`node node-${pos}`} key={name}>
                <span className="node-no">{no}</span>
                <strong>{name}</strong>
                <small>
                  <StatusDot /> active plane
                </small>
              </div>
            ))}
          </div>
          <div className="visual-footer">
            <span>
              <span className="metric-line" /> BUSINESS · CONTROL · EXECUTION
            </span>
            <span>01 — 04 · LIVE TELEMETRY</span>
          </div>
        </section>
      </main>
      <footer className="entry-footer">
        <span>© 2026 VectorOps Control Plane</span>
        <span>Three-plane architecture with real-time telemetry, n8n orchestration, and isolated business portals.</span>
        <span className="footer-links">
          <a href="#security">Security</a>
          <a href="#status">Status</a>
        </span>
      </footer>
    </div>
  );
}

export function LoginPanel({ mode, onClose }: { mode: "admin" | "client"; onClose: () => void }) {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const isOperator = mode === "admin";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (supabaseConfigured || edgeApiUrl) {
        const user = await signInForRole(email, password, mode);
        toast.success(isOperator ? "Operator authentication confirmed." : "Business authentication confirmed.");
        onClose();
        navigate(isOperator ? "/admin" : `/portal/${user?.slug}`);
        return;
      }
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string; slug?: string };
      if (!response.ok || !result.ok) {
        toast.error(result.error || "Invalid email or password.");
        return;
      }
      toast.success(isOperator ? "Operator authentication confirmed." : "Business authentication confirmed.");
      onClose();
      navigate(isOperator ? "/admin" : `/portal/${result.slug}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication service unavailable.";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="login-panel panel neumorph" onMouseDown={(e) => e.stopPropagation()} style={{ border: isOperator ? "1px solid rgba(0, 240, 255, 0.35)" : "1px solid rgba(168, 85, 247, 0.35)", boxShadow: isOperator ? "0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(0,240,255,0.2)" : "0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(168,85,247,0.2)" }}>
        <button className="close-button" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <div className="login-symbol" style={{ background: isOperator ? "linear-gradient(135deg, rgba(0, 240, 255, 0.2), rgba(37, 99, 235, 0.2))" : "linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(236, 72, 153, 0.2))", color: isOperator ? "#00f0ff" : "#c084fc", border: `1px solid ${isOperator ? "rgba(0, 240, 255, 0.4)" : "rgba(168, 85, 247, 0.4)"}` }}>
          <LockKeyhole size={21} />
        </div>
        <div className="eyebrow" style={{ color: isOperator ? "#00f0ff" : "#c084fc" }}>
          <span className="signal" /> {isOperator ? "OPERATOR ACCESS" : "BUSINESS ACCESS"}
        </div>
        <h2>{isOperator ? "LOG IN AS OPERATOR" : "LOG IN AS BUSINESS"}</h2>
        <p>
          {isOperator
            ? "Sign in with your verified operator credentials."
            : "Sign in with your business account email and password."}
        </p>
        <form onSubmit={submit}>
          <label>
            Email
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder={isOperator ? "operator@vectorops.ai" : "sarah@apexdental.com"}
              required
              autoFocus
            />
          </label>
          <label>
            Password
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••••"
              required
            />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
            <a className="text-button" href={`/auth/forgot?mode=${mode}`}>Forgot password?</a>
          </div>
          <Button className="primary-cta full" type="submit" disabled={busy} style={{ marginTop: "12px" }}>
            {busy ? "Authenticating..." : (isOperator ? "LOG IN AS OPERATOR" : "LOG IN AS BUSINESS")}
            <ChevronRight size={16} />
          </Button>
        </form>
        <div className="login-note">
          <ShieldCheck size={15} /> Signed sessions with role-based cryptographic verification.
        </div>
      </div>
    </div>
  );
}

export function CommandCenter({ onLogout }: { onLogout: () => void }) {
  const [, navigate] = useLocation();
  const [active, setActive] = useState("Overview");
  const [sidebar, setSidebar] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const logout = async () => {
    try {
      await signOut();
    } finally {
      onLogout();
    }
  };

  useEffect(() => {
    let mounted = true;
    getCurrentUser()
      .then((user) => {
        if (!mounted) return;
        if (user?.role === "admin") setAuthorized(true);
        else navigate("/");
      })
      .catch(() => mounted && navigate("/"))
      .finally(() => mounted && setAuthLoading(false));
    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (authLoading) {
    return (
      <div className="portal-page" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div className="panel neumorph" style={{ padding: "30px", textAlign: "center" }}>
          <div className="signal" style={{ margin: "0 auto 10px" }} />
          Verifying operator session...
        </div>
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <div className="side-top">
          <Brand />
          <button className="close-button mobile-only" onClick={() => setSidebar(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="workspace-switch">
          <div className="workspace-avatar">VO</div>
          <div>
            <strong>VectorOps Agency</strong>
            <small>Master operator workspace</small>
          </div>
          <ChevronRight size={15} />
        </div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              className={active === label ? "active" : ""}
              onClick={() => {
                setActive(label);
                setSidebar(false);
              }}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="secure-chip">
            <ShieldCheck size={15} />
            <span>
              <strong>3-Plane Control</strong>
              <small>Session verified</small>
            </span>
          </div>
          <button className="logout" onClick={logout}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="topbar">
          <button className="menu-button mobile-only" onClick={() => setSidebar(true)}>
            <Menu size={19} />
          </button>
          <div className="crumb">
            <span>Operator Console</span>
            <ChevronRight size={14} />
            <strong style={{ color: "#00f0ff" }}>{active}</strong>
          </div>
          <div className="top-actions" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span className="live-pill hide-mobile" style={{ fontSize: "10px", padding: "4px 10px", background: "rgba(0, 240, 255, 0.1)", border: "1px solid rgba(0, 240, 255, 0.3)", color: "#00f0ff", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <StatusDot tone="green" /> 3-PLANE ACTIVE
            </span>
            <ThemeToggle />
            <div className="avatar" title="Master Operator" style={{ background: "linear-gradient(135deg, #00d2ff, #2563eb)", color: "#fff", fontWeight: 700 }}>OP</div>
          </div>
        </header>

        <div className="page-wrap">
          {active === "Overview" && (
            <OverviewView
              onNavigate={(module) => setActive(module)}
              onAddClient={() => setShowOnboarding(true)}
              onOpenClient={(client) => {
                setSelectedClient(client);
                setActive("Businesses");
              }}
            />
          )}

          {(active === "Businesses" || active === "Clients") && (
            <ClientsView
              onAddClient={() => setShowOnboarding(true)}
              selectedClient={selectedClient}
              onCloseDetail={() => setSelectedClient(null)}
            />
          )}

          {active === "Money" && <MoneyView />}

          {active === "Automations" && <AutomationsView />}

          {active === "Infrastructure" && <InfrastructureView />}

          {active === "Support" && <SupportView />}

          {active === "Calendar" && <CalendarView />}

          {active === "Tasks" && <TasksView />}

          {active === "Activity" && <ActivityView />}

          {active === "Audit" && <AuditView />}

          {active === "Settings" && <SettingsView />}
        </div>
      </main>

      {/* 9-Step Onboarding Wizard */}
      {showOnboarding && (
        <OnboardingWizard
          onClose={() => setShowOnboarding(false)}
          onComplete={() => {
            setShowOnboarding(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
