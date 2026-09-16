import { Database, Layers, Lock } from "lucide-react";

export function SettingsView() {
  return (
    <div>
      <div className="page-header">
        <div><div className="eyebrow"><span className="signal" /> SYSTEM CONFIGURATION</div><h1>Settings</h1><p>Architecture and environment guidance. Live health belongs in Infrastructure; mutations belong in Audit.</p></div>
      </div>
      <div className="stat-grid settings-grid">
        <div className="panel neumorph"><Database size={18} /><h3>Supabase persistence</h3><p>Production uses the configured Supabase project. Local preview data is development-only and is never presented as synchronized production state.</p></div>
        <div className="panel neumorph"><Lock size={18} /><h3>Authentication & tenancy</h3><p>Supabase Auth sessions resolve roles through profiles; browser access remains constrained by row-level security.</p></div>
        <div className="panel neumorph"><Layers size={18} /><h3>Three-plane model</h3><p>Business data, desired control state, and n8n execution state remain separate. Drift is shown explicitly until verified.</p></div>
      </div>
      <div className="panel neumorph">
        <div className="panel-head"><div><div className="eyebrow">PRODUCTION CONFIGURATION</div><h2>Required environment</h2></div></div>
        <p className="muted">Configure Supabase, public application URL, session secret, n8n Vault references, and telemetry worker credentials only in the deployment environment. Secrets must never be placed in client-side variables.</p>
      </div>
    </div>
  );
}
