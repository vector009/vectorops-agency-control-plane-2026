import { useState, useEffect } from "react";
import {
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Building2,
  Globe,
  CircleDollarSign,
  Network,
  Zap,
  Lock,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import type { AutomationTemplate, N8nInstance } from "@/types/vectorops";
import { apiFetch as fetch } from "@/lib/api";

interface OnboardingWizardProps {
  onClose: () => void;
  onComplete: () => void;
}

export function OnboardingWizard({ onClose, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [instances, setInstances] = useState<N8nInstance[]>([]);

  const [form, setForm] = useState({
    // Step 1: Identity
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    notes: "",

    // Step 2: Portal
    slug: "",
    portal_title: "",
    primary_color: "#346bf2",
    accent_color: "#8b68df",
    logo_url: "",
    enabled_modules: ["overview", "automations", "results", "billing", "support", "profile"],
    dashboard_config: { industry: "professional_services" },
    kpi_config: [
      { key: "lead_captured", label: "New leads" },
      { key: "appointment_booked", label: "Appointments booked" },
      { key: "review_received", label: "Reviews received" },
    ],
    terminology: { leads: "Leads", conversions: "Conversions" },

    // Step 3: Subscription
    service_name: "Monthly AI Automation & Lead Operations Retainer",
    monthly_amount: 599,
    currency: "USD",
    billing_day: 1,
    auto_renew: true,

    // Step 4: Infrastructure
    infrastructure_type: "shared" as "shared" | "dedicated",
    n8n_instance_id: "",

    // Step 5: Templates
    selected_templates: [] as string[],

    // Step 6: Client Authentication
    client_password: "",
  });

  useEffect(() => {
    // Load reusable templates and instances
    Promise.all([
      fetch("/api/admin/data/automation_templates", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/data/n8n_instances", { credentials: "include" }).then((r) => r.json()),
    ]).then(([tmplRes, instRes]) => {
      if (tmplRes.ok) setTemplates(tmplRes.rows || []);
      if (instRes.ok) {
        const rows = instRes.rows || [];
        setInstances(rows);
        if (rows[0]) setForm((current) => current.n8n_instance_id ? current : { ...current, n8n_instance_id: rows[0].id });
      }
    });
  }, []);

  const update = (key: string, value: any) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "company_name" && !prev.slug) {
        next.slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        next.portal_title = `${value} Portal`;
      }
      return next;
    });
  };

  const handleNext = () => {
    if (step === 1 && (!form.company_name || !form.email)) {
      toast.error("Company name and email are required.");
      return;
    }
    if (step === 2 && (!form.slug || !form.portal_title)) {
      toast.error("Portal slug and title are required.");
      return;
    }
    if (step === 6 && !form.client_password) {
      toast.error("Client password is required.");
      return;
    }
    setStep((s) => s + 1);
  };

  const handleBack = () => setStep((s) => s - 1);

  const handleSubmit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/onboarding", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Tenant ${form.company_name} created. Continue the persisted onboarding checklist to verify n8n and deliver access.`);
        onComplete();
      } else {
        toast.error(data.error || "Onboarding failed.");
      }
    } catch {
      toast.error("Network error during tenant onboarding.");
    } finally {
      setBusy(false);
    }
  };

  const stepsList = [
    { num: 1, label: "Identity" },
    { num: 2, label: "Portal Config" },
    { num: 3, label: "Retainer & Money" },
    { num: 4, label: "Infrastructure" },
    { num: 5, label: "Automations" },
    { num: 6, label: "Security & Auth" },
    { num: 7, label: "Review & Create" },
  ];

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="onboarding-modal panel neumorph" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: "780px" }}>
        {/* Header */}
        <div className="modal-head">
          <div>
            <div className="eyebrow">
              <span className="signal" /> TENANT ONBOARDING ENGINE / STEP {step} OF 7
            </div>
            <h2>{stepsList[step - 1].label}</h2>
            <p>Create the tenant foundation. Execution, verification, and access delivery remain incomplete until confirmed in the client checklist.</p>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Step Progress Bar */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "22px" }}>
          {stepsList.map((s) => (
            <div
              key={s.num}
              style={{
                flex: 1,
                height: "4px",
                borderRadius: "2px",
                background: s.num <= step ? "var(--blue)" : "var(--line)",
                transition: "all .2s ease",
              }}
            />
          ))}
        </div>

        {/* Step 1: Identity */}
        {step === 1 && (
          <div className="onboarding-grid">
            <label>
              Company Name *
              <input
                value={form.company_name}
                onChange={(e) => update("company_name", e.target.value)}
                placeholder="Apex Dental Studio"
                required
              />
            </label>
            <label>
              Contact Person
              <input
                value={form.contact_name}
                onChange={(e) => update("contact_name", e.target.value)}
                placeholder="Dr. Julian Vance"
              />
            </label>
            <label>
              Business Email *
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="julian@apexdental.com"
                required
              />
            </label>
            <label>
              Phone
              <input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="+1 (555) 234-8900"
              />
            </label>
            <label style={{ gridColumn: "1/-1" }}>
              Initial Scope & Operator Notes
              <input
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="High-ticket cosmetic dentistry clinic needing automated lead recovery."
              />
            </label>
          </div>
        )}

        {/* Step 2: Portal */}
        {step === 2 && (
          <div className="onboarding-grid">
            <label>
              Portal Slug (URL) *
              <input
                value={form.slug}
                onChange={(e) => update("slug", e.target.value.toLowerCase())}
                placeholder="apex-dental"
                required
              />
            </label>
            <label>
              Portal Title *
              <input
                value={form.portal_title}
                onChange={(e) => update("portal_title", e.target.value)}
                placeholder="Apex Dental Executive Portal"
                required
              />
            </label>
            <label>
              Primary Brand Accent
              <input
                type="color"
                value={form.primary_color}
                onChange={(e) => update("primary_color", e.target.value)}
                style={{ height: "42px", padding: "4px" }}
              />
            </label>
            <label>
              Secondary Brand Accent
              <input
                type="color"
                value={form.accent_color}
                onChange={(e) => update("accent_color", e.target.value)}
                style={{ height: "42px", padding: "4px" }}
              />
            </label>
            <label style={{ gridColumn: "1/-1" }}>
              Logo URL
              <input value={form.logo_url} onChange={(e) => update("logo_url", e.target.value)} placeholder="https://cdn.example.com/client-logo.png" />
            </label>
            <label>
              Primary KPI Label
              <input
                value={String(form.kpi_config[0]?.label || "")}
                onChange={(e) => update("kpi_config", [{ ...form.kpi_config[0], label: e.target.value }, ...form.kpi_config.slice(1)])}
                placeholder="New patients"
              />
            </label>
            <label>
              Primary KPI Event Key
              <input
                value={String(form.kpi_config[0]?.key || "")}
                onChange={(e) => update("kpi_config", [{ ...form.kpi_config[0], key: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_") }, ...form.kpi_config.slice(1)])}
                placeholder="lead_captured"
              />
            </label>
            <div style={{ gridColumn: "1/-1" }}>
              <span className="eyebrow" style={{ marginBottom: "8px" }}>ENABLED CLIENT MODULES</span>
              <div className="module-picker">
                {["overview", "automations", "results", "billing", "support", "profile"].map((module) => (
                  <label className="module-option" key={module}>
                    <input
                      type="checkbox"
                      checked={form.enabled_modules.includes(module)}
                      onChange={() => update("enabled_modules", form.enabled_modules.includes(module) ? form.enabled_modules.filter((item) => item !== module) : [...form.enabled_modules, module])}
                    />
                    {module.replace("_", " ")}
                  </label>
                ))}
              </div>
            </div>
            <label>
              Portal URL Preview
              <input
                value={`/portal/${form.slug}`}
                disabled
                style={{ opacity: 0.7, fontFamily: "monospace" }}
              />
            </label>
          </div>
        )}

        {/* Step 3: Retainer & Money */}
        {step === 3 && (
          <div className="onboarding-grid">
            <label style={{ gridColumn: "1/-1" }}>
              Retainer Service Package
              <input
                value={form.service_name}
                onChange={(e) => update("service_name", e.target.value)}
              />
            </label>
            <label>
              Monthly Retainer Amount
              <input
                type="number"
                value={form.monthly_amount}
                onChange={(e) => update("monthly_amount", Number(e.target.value))}
              />
            </label>
            <label>
              Billing Currency
              <select value={form.currency} onChange={(e) => update("currency", e.target.value)}>
                <option value="USD">USD — US Dollar</option>
                <option value="INR">INR — Indian Rupee</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="EUR">EUR — Euro</option>
                <option value="AUD">AUD — Australian Dollar</option>
              </select>
            </label>
            <label>
              Billing Day of Month (1 - 28)
              <input
                type="number"
                min={1}
                max={28}
                value={form.billing_day}
                onChange={(e) => update("billing_day", Number(e.target.value))}
              />
            </label>
          </div>
        )}

        {/* Step 4: Infrastructure */}
        {step === 4 && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
              <div
                className={`panel neumorph ${form.infrastructure_type === "shared" ? "active" : ""}`}
                style={{
                  cursor: "pointer",
                  border: form.infrastructure_type === "shared" ? "2px solid var(--blue)" : "1px solid var(--line)",
                  padding: "16px",
                }}
                onClick={() => update("infrastructure_type", "shared")}
              >
                <Network size={22} style={{ color: "var(--blue)", marginBottom: "8px" }} />
                <h4 style={{ margin: 0 }}>Shared Cluster</h4>
                <p style={{ fontSize: "11px", color: "var(--muted)", margin: "4px 0 0" }}>
                  Multi-tenant isolation on the primary high-throughput n8n node.
                </p>
              </div>

              <div
                className={`panel neumorph ${form.infrastructure_type === "dedicated" ? "active" : ""}`}
                style={{
                  cursor: "pointer",
                  border: form.infrastructure_type === "dedicated" ? "2px solid var(--blue)" : "1px solid var(--line)",
                  padding: "16px",
                }}
                onClick={() => update("infrastructure_type", "dedicated")}
              >
                <Network size={22} style={{ color: "var(--purple)", marginBottom: "8px" }} />
                <h4 style={{ margin: 0 }}>Dedicated Instance</h4>
                <p style={{ fontSize: "11px", color: "var(--muted)", margin: "4px 0 0" }}>
                  Isolated VPS execution instance for high-compliance enterprise clients.
                </p>
              </div>
            </div>

            <label style={{ display: "grid", gap: "6px", font: "10px 'DM Mono', monospace", color: "var(--muted)" }}>
              ASSIGNED N8N NODE
              <select
                value={form.n8n_instance_id}
                onChange={(e) => update("n8n_instance_id", e.target.value)}
                style={{ padding: "10px", borderRadius: "8px", background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)" }}
              >
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.instance_name} ({i.hosting_type}) — {i.base_url}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Step 5: Automations */}
        {step === 5 && (
          <div>
            <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "14px" }}>
              Select automation templates for the onboarding plan. A template is deployed only later through an explicit, verified n8n deployment:
            </p>
            <div style={{ display: "grid", gap: "10px" }}>
              {templates.map((t) => {
                const selected = form.selected_templates.includes(t.id);
                return (
                  <div
                    key={t.id}
                    className="panel neumorph"
                    style={{
                      padding: "12px 16px",
                      cursor: "pointer",
                      border: selected ? "2px solid var(--blue)" : "1px solid var(--line)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                    onClick={() => {
                      const next = selected
                        ? form.selected_templates.filter((id) => id !== t.id)
                        : [...form.selected_templates, t.id];
                      update("selected_templates", next);
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: "12px" }}>{t.name}</strong>
                      <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--muted)" }}>
                        {t.description} • {t.target_industry}
                      </p>
                    </div>
                    <span className={`badge ${selected ? "badge-blue" : "badge-muted"}`}>
                      {selected ? "SELECTED" : "CLICK TO ADD"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 6: Security & Credentials */}
        {step === 6 && (
          <div className="onboarding-grid">
            <label style={{ gridColumn: "1/-1" }}>
              Initial Client Password *
              <input
                type="password"
                value={form.client_password}
                onChange={(e) => update("client_password", e.target.value)}
                minLength={12}
                autoComplete="new-password"
                required
              />
              <small style={{ textTransform: "none", color: "var(--muted)", marginTop: "6px", display: "block" }}>
                Use at least 12 characters. The password is sent directly to Supabase Auth and is never stored in VectorOps application tables.
              </small>
            </label>
          </div>
        )}

        {/* Step 7: Review & Launch */}
        {step === 7 && (
          <div>
            <div className="panel neumorph" style={{ padding: "18px", marginBottom: "16px" }}>
              <span className="eyebrow">CONFIRMATION SUMMARY</span>
              <h3 style={{ margin: "4px 0 12px" }}>{form.company_name}</h3>
              <div className="form-row-2">
                <div>
                  <small className="muted">Primary Contact</small>
                  <p style={{ margin: "2px 0 8px", fontWeight: 600 }}>{form.contact_name || form.email}</p>
                </div>
                <div>
                  <small className="muted">Portal Access</small>
                  <p style={{ margin: "2px 0 8px", fontWeight: 600, fontFamily: "monospace" }}>/portal/{form.slug}</p>
                </div>
                <div>
                  <small className="muted">Retainer</small>
                  <p style={{ margin: "2px 0 8px", fontWeight: 600 }}>${form.monthly_amount} / month</p>
                </div>
                <div>
                  <small className="muted">Automations</small>
                  <p style={{ margin: "2px 0 8px", fontWeight: 600 }}>{form.selected_templates.length} template(s) selected for review</p>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", color: "var(--green)", font: "10px 'DM Mono', monospace" }}>
              <CheckCircle2 size={16} /> Ready to create the tenant foundation. This does not claim n8n verification or access delivery.
            </div>
          </div>
        )}

        {/* Navigation Actions */}
        <div className="modal-actions" style={{ marginTop: "24px" }}>
          {step > 1 && (
            <button type="button" className="secondary-cta" onClick={handleBack} disabled={busy}>
              <ChevronLeft size={16} /> Back
            </button>
          )}
          {step < 7 ? (
            <button type="button" className="primary-cta" onClick={handleNext}>
              Next Step <ChevronRight size={16} />
            </button>
          ) : (
            <button type="button" className="primary-cta" onClick={handleSubmit} disabled={busy}>
              {busy ? "Creating Tenant..." : "Create Tenant & Continue Setup"} <ArrowUpRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
