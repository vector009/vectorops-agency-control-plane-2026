import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { edgeApiUrl, requireSupabase, supabaseConfigured } from "@/lib/supabase";
import { apiFetch as fetch } from "@/lib/api";

function recoveryMode() {
  return new URLSearchParams(window.location.search).get("mode") === "client" ? "client" : "admin";
}

export function PasswordRecoveryRequest() {
  const [, navigate] = useLocation();
  const mode = recoveryMode();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (supabaseConfigured) {
        const redirectTo = `${window.location.origin}/auth/reset?mode=${mode}`;
        const result = await requireSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
        if (result.error) throw new Error("Unable to send a recovery email right now. Please wait and try again.");
        setSuccess("If an account exists for that email, Supabase will send a password recovery link.");
        return;
      }
      const response = await fetch("/api/auth/recovery/request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, mode }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to request password recovery.");
      setSuccess(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to request password recovery.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="portal-login-screen auth-flow-page">
      <section className="portal-login-card panel neumorph auth-flow-card">
        <div className="login-symbol"><KeyRound size={21} /></div>
        <div className="eyebrow"><span className="signal" /> SUPABASE AUTH RECOVERY</div>
        <h1>Reset your password</h1>
        <p>Enter the email for your {mode === "admin" ? "operator" : "business portal"} account. For security, the response is the same whether the account exists or not.</p>
        {success ? (
          <div className="auth-state success"><CheckCircle2 size={18} /><div><strong>Check your email</strong><span>{success}</span></div></div>
        ) : (
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Email</label>
              <input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} required autoFocus />
            </div>
            {error && <div className="auth-state error">{error}</div>}
            <button className="primary-cta" type="submit" disabled={busy}>{busy ? "Sending…" : "Send recovery email"}</button>
          </form>
        )}
        <button className="text-button auth-back" onClick={() => navigate("/")}><ArrowLeft size={14} /> Back to login</button>
      </section>
    </main>
  );
}

export function PasswordReset() {
  const [, navigate] = useLocation();
  const recovery = useMemo(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    return {
      access_token: hash.get("access_token") || "",
      refresh_token: hash.get("refresh_token") || "",
      code: query.get("code") || "",
      type: hash.get("type"),
      providerError: hash.get("error_description") || query.get("error_description") || "",
    };
  }, []);
  const validLink = Boolean(recovery.code || (recovery.access_token && recovery.refresh_token && (!recovery.type || recovery.type === "recovery")));
  const [sessionReady, setSessionReady] = useState(!edgeApiUrl);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(recovery.providerError || (!validLink ? "This recovery link is invalid or expired. Request a new one." : ""));
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured || !validLink) return;
    let active = true;
    const establishRecoverySession = async () => {
      try {
        const auth = requireSupabase().auth;
        const result = recovery.code
          ? await auth.exchangeCodeForSession(recovery.code)
          : await auth.setSession({ access_token: recovery.access_token, refresh_token: recovery.refresh_token });
        if (result.error || !result.data.session) throw result.error || new Error("Recovery session is unavailable.");
        if (active) setSessionReady(true);
      } catch {
        if (active) setError("This recovery link is invalid or expired. Request a new one.");
      }
    };
    void establishRecoverySession();
    return () => { active = false; };
  }, [recovery, validLink]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (password !== confirmation) return setError("Passwords do not match.");
    if (password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      return setError("Use 12–128 characters with uppercase, lowercase, and a number.");
    }
    setBusy(true);
    try {
      if (supabaseConfigured) {
        if (!sessionReady) throw new Error("This recovery link is invalid or expired. Request a new one.");
        const auth = requireSupabase().auth;
        const result = await auth.updateUser({ password });
        if (result.error) throw result.error;
        const current = await fetch("/api/auth/me");
        const currentBody = await current.json() as { user?: { role?: string; slug?: string } };
        const destination = currentBody.user?.role === "client" && currentBody.user.slug ? `/portal/${currentBody.user.slug}` : "/admin";
        window.history.replaceState({}, document.title, "/auth/reset");
        setComplete(true);
        window.setTimeout(() => navigate(destination), 900);
        return;
      }
      const response = await fetch("/api/auth/recovery/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...recovery, new_password: password }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to update password.");
      window.history.replaceState({}, document.title, "/auth/reset");
      setComplete(true);
      window.setTimeout(() => navigate(result.destination || "/"), 900);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="portal-login-screen auth-flow-page">
      <section className="portal-login-card panel neumorph auth-flow-card">
        <div className="login-symbol"><ShieldCheck size={21} /></div>
        <div className="eyebrow"><span className="signal" /> SECURE PASSWORD UPDATE</div>
        <h1>{complete ? "Password updated" : "Choose a new password"}</h1>
        {complete ? (
          <div className="auth-state success"><CheckCircle2 size={18} /><div><strong>Update complete</strong><span>Returning to your authenticated workspace…</span></div></div>
        ) : validLink && sessionReady ? (
          <form onSubmit={submit}>
            <div className="form-group"><label>New password</label><input type="password" autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} required autoFocus /></div>
            <div className="form-group"><label>Confirm password</label><input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError(""); }} required /></div>
            <small className="muted">12–128 characters, including uppercase, lowercase, and a number.</small>
            {error && <div className="auth-state error">{error}</div>}
            <button className="primary-cta" type="submit" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
          </form>
        ) : validLink && !error ? (
          <div className="auth-state"><span>Validating your recovery link…</span></div>
        ) : (
          <div className="auth-state error">{error}</div>
        )}
        {!validLink && <button className="text-button auth-back" onClick={() => navigate(`/auth/forgot?mode=${recoveryMode()}`)}>Request a new recovery link</button>}
      </section>
    </main>
  );
}
