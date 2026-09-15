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
import { OnboardingWizard } from "@/components/admin/OnboardingWizard";

const nav = [
  ["Overview", LayoutDashboard],
  ["Clients", Users],
  ["Automations", Zap],
  ["Money", CircleDollarSign],
  ["Calendar", CalendarDays],
  ["Tasks", Check],
  ["Support", Ticket],
  ["Infrastructure", Network],
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
            <StatusDot /> SYSTEM READY
          </span>
          <ThemeToggle />
          <button className="text-button" onClick={onClient}>
            Client portal <ArrowUpRight size={15} />
          </button>
        </div>
      </header>
      <main className="entry-main">
        <section className="hero-copy">
          <div className="eyebrow">
            <span className="signal" /> CONTROL PLANE / 01
          </div>
          <h1>
            Your agency,
            <br />
            <em>under one</em> operating system.
          </h1>
          <p className="hero-lede">
            Manage the business plane, automation control plane, and execution health from one precise command center.
          </p>
          <div className="hero-actions">
            <Button className="primary-cta" onClick={onAdmin}>
              <LockKeyhole size={16} /> Enter admin console <ChevronRight size={16} />
            </Button>
            <button className="secondary-cta" onClick={onClient}>
              Client login <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="trust-row">
            <ShieldCheck size={16} />
            <span>Master Auth verified</span>
            <span className="separator" />
            <span>Multi-tenant isolated</span>
            <span className="separator" />
            <span>Audit ready</span>
          </div>
        </section>
        <section className="system-visual">
          <div className="visual-header">
            <span>VECTOROPS / THREE-PLANE SYSTEM MAP</span>
            <span className="live-pill">
              <StatusDot /> LIVE SURFACE
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
              <small>COMMAND CENTER</small>
            </div>
            {[
              ["BUSINESS", "01", "top"],
              ["CONTROL", "02", "right"],
              ["EXECUTION", "03", "bottom"],
              ["CLIENT", "04", "left"],
            ].map(([name, no, pos]) => (
              <div className={`node node-${pos}`} key={name}>
                <span className="node-no">{no}</span>
                <strong>{name}</strong>
                <small>
                  <StatusDot /> synchronized
                </small>
              </div>
            ))}
          </div>
          <div className="visual-footer">
            <span>
              <span className="metric-line" /> BUSINESS / CONTROL / EXECUTION
            </span>
            <span>01 — 04</span>
          </div>
        </section>
      </main>
      <footer className="entry-footer">
        <span>© 2026 VectorOps Control Plane</span>
        <span>Three-plane architecture with Section 51 partial payments and Section 54 safe churn.</span>
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
  const [email, setEmail] = useState(mode === "admin" ? "admin@vectorops.ai" : "sarah@apexdental.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
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
      toast.success(mode === "admin" ? "Admin authentication confirmed." : "Client authentication confirmed.");
      onClose();
      navigate(mode === "admin" ? "/admin" : `/portal/${result.slug}`);
    } catch {
      toast.error("Authentication service unavailable.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="login-panel panel neumorph" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <div className="login-symbol">
          <LockKeyhole size={21} />
        </div>
        <div className="eyebrow">
          <span className="signal" /> {mode === "admin" ? "OPERATOR AUTHENTICATION" : "CLIENT PORTAL AUTHENTICATION"}
        </div>
        <h2>{mode === "admin" ? "LOGIN AS ADMIN" : "CLIENT PORTAL LOGIN"}</h2>
        <p>
          {mode === "admin"
            ? "Sign in with your verified Supabase administrator credentials."
            : "Sign in with your tenant account email and password."}
        </p>
        <form onSubmit={submit}>
          <label>
            Email
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder={mode === "admin" ? "admin@vectorops.ai" : "sarah@apexdental.com"}
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
              placeholder="••••••••••••"
              required
            />
          </label>
          <Button className="primary-cta full" type="submit" disabled={busy} style={{ marginTop: "12px" }}>
            {busy ? "Authenticating..." : "LOGIN"}
            <ChevronRight size={16} />
          </Button>
        </form>
        <div className="login-note">
          <ShieldCheck size={15} /> Supabase Auth & Role-Based Access Control verified.
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

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (response) => ({ ok: response.ok, body: await response.json() }))
      .then((result) => {
        if (!mounted) return;
        if (result.ok && result.body.user?.role === "admin") setAuthorized(true);
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
              <small>Master Key Active</small>
            </span>
          </div>
          <button className="logout" onClick={onLogout}>
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
            <span>Agency workspace</span>
            <ChevronRight size={14} />
            <strong>{active}</strong>
          </div>
          <div className="top-actions">
            <ThemeToggle />
            <div className="avatar">VO</div>
          </div>
        </header>

        <div className="page-wrap">
          {active === "Overview" && (
            <OverviewView
              onNavigate={(module) => setActive(module)}
              onAddClient={() => setShowOnboarding(true)}
              onOpenClient={(client) => {
                setSelectedClient(client);
                setActive("Clients");
              }}
            />
          )}

          {active === "Clients" && (
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

