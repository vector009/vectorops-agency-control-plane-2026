import { useState, useEffect, useMemo } from "react";
import {
  CircleDollarSign,
  TrendingUp,
  AlertTriangle,
  Receipt,
  CreditCard,
  Plus,
  ArrowUpRight,
  CheckCircle2,
  Calendar,
  X,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import type { Invoice, Subscription, Payment, BillingAdjustment, Client } from "@/types/vectorops";

export function MoneyView() {
  const [activeTab, setActiveTab] = useState<"invoices" | "subscriptions" | "payments" | "adjustments">("invoices");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [adjustments, setAdjustments] = useState<BillingAdjustment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<Invoice | null>(null);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);

  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/data/invoices", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/data/subscriptions", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/data/payments", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/data/billing_adjustments", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/data/clients", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([invRes, subRes, payRes, adjRes, cliRes]) => {
        if (invRes.ok) setInvoices(invRes.rows || []);
        if (subRes.ok) setSubscriptions(subRes.rows || []);
        if (payRes.ok) setPayments(payRes.rows || []);
        if (adjRes.ok) setAdjustments(adjRes.rows || []);
        if (cliRes.ok) setClients(cliRes.rows || []);
      })
      .catch(() => toast.error("Failed to load financial records."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute 4 Financial KPIs
  const mrr = useMemo(() => {
    return subscriptions
      .filter((s) => s.status === "active")
      .reduce((sum, s) => sum + Number(s.monthly_amount || 0), 0);
  }, [subscriptions]);

  const collected = useMemo(() => {
    return payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [payments]);

  const outstanding = useMemo(() => {
    return invoices
      .filter((i) => i.status !== "paid" && i.status !== "voided")
      .reduce((sum, i) => sum + Math.max(0, Number(i.total_amount) - Number(i.amount_paid)), 0);
  }, [invoices]);

  const overdue = useMemo(() => {
    return invoices
      .filter((i) => i.status === "overdue")
      .reduce((sum, i) => sum + Math.max(0, Number(i.total_amount) - Number(i.amount_paid)), 0);
  }, [invoices]);

  const clientNameMap = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => map.set(c.id, c.company_name));
    return map;
  }, [clients]);

  // Handle Record Payment
  const openPaymentModal = (invoice?: Invoice) => {
    if (invoice) {
      setSelectedInvoiceForPayment(invoice);
    } else {
      const firstUnpaid = invoices.find((i) => i.status !== "paid");
      setSelectedInvoiceForPayment(firstUnpaid || invoices[0] || null);
    }
    setShowPaymentModal(true);
  };

  return (
    <div className="money-view">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="eyebrow">
            <span className="signal" /> VECTOROPS / FINANCIAL PLANE
          </div>
          <h1>Money & Revenue Operations</h1>
          <p>Retainer subscriptions, partial payments reconciliation, and revenue audit trails.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="soft-button" onClick={() => setShowAdjustmentModal(true)}>
            <Plus size={15} /> Record Adjustment
          </button>
          <button className="primary-cta" onClick={() => openPaymentModal()}>
            <CreditCard size={15} /> Record Payment
          </button>
        </div>
      </div>

      {/* 4 Financial KPI Cards */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="stat neumorph">
          <div className="stat-top">
            <span>MONTHLY RECURRING REVENUE</span>
            <CircleDollarSign size={18} style={{ color: "var(--blue)" }} />
          </div>
          <strong>{currency.format(mrr)}</strong>
          <small>{subscriptions.filter((s) => s.status === "active").length} active retainers</small>
        </div>

        <div className="stat neumorph">
          <div className="stat-top">
            <span>TOTAL COLLECTED</span>
            <TrendingUp size={18} style={{ color: "var(--green)" }} />
          </div>
          <strong>{currency.format(collected)}</strong>
          <small>{payments.length} verified payment entries</small>
        </div>

        <div className={`stat neumorph ${outstanding > 0 ? "amber" : ""}`}>
          <div className="stat-top">
            <span>OUTSTANDING RECEIVABLES</span>
            <AlertTriangle size={18} style={{ color: "var(--amber)" }} />
          </div>
          <strong>{currency.format(outstanding)}</strong>
          <small>Uncollected invoice balances</small>
        </div>

        <div className={`stat neumorph ${overdue > 0 ? "amber" : ""}`}>
          <div className="stat-top">
            <span>OVERDUE REVENUE</span>
            <AlertTriangle size={18} style={{ color: overdue > 0 ? "#ef4444" : "var(--muted)" }} />
          </div>
          <strong style={{ color: overdue > 0 ? "#ef4444" : "inherit" }}>{currency.format(overdue)}</strong>
          <small>Invoices past due date</small>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-group">
        <button
          className={`tab-btn ${activeTab === "invoices" ? "active" : ""}`}
          onClick={() => setActiveTab("invoices")}
        >
          INVOICES ({invoices.length})
        </button>
        <button
          className={`tab-btn ${activeTab === "subscriptions" ? "active" : ""}`}
          onClick={() => setActiveTab("subscriptions")}
        >
          SUBSCRIPTIONS & RETAINERS ({subscriptions.length})
        </button>
        <button
          className={`tab-btn ${activeTab === "payments" ? "active" : ""}`}
          onClick={() => setActiveTab("payments")}
        >
          PAYMENTS & LEDGER ({payments.length})
        </button>
        <button
          className={`tab-btn ${activeTab === "adjustments" ? "active" : ""}`}
          onClick={() => setActiveTab("adjustments")}
        >
          BILLING ADJUSTMENTS ({adjustments.length})
        </button>
      </div>

      {/* Main Table Content */}
      <div className="panel neumorph">
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>Loading records...</div>
        ) : (
          <div>
            {/* TAB 1: INVOICES */}
            {activeTab === "invoices" && (
              <table className="interactive-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Client</th>
                    <th>Period</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Remaining</th>
                    <th>Status</th>
                    <th>Due Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const remaining = Math.max(0, Number(inv.total_amount) - Number(inv.amount_paid));
                    return (
                      <tr key={inv.id}>
                        <td>
                          <strong>{inv.invoice_number}</strong>
                          <small style={{ display: "block", color: "var(--muted)" }}>{inv.description}</small>
                        </td>
                        <td>{clientNameMap.get(inv.client_id) || inv.client_id}</td>
                        <td style={{ fontFamily: "monospace", fontSize: "10px" }}>
                          {inv.period_start ? `${inv.period_start} to ${inv.period_end}` : "One-time"}
                        </td>
                        <td>{currency.format(inv.total_amount)}</td>
                        <td style={{ color: "var(--green)" }}>{currency.format(inv.amount_paid)}</td>
                        <td style={{ fontWeight: 600, color: remaining > 0 ? "var(--amber)" : "var(--muted)" }}>
                          {currency.format(remaining)}
                        </td>
                        <td>
                          <span
                            className={`badge badge-${
                              inv.status === "paid"
                                ? "green"
                                : inv.status === "partially_paid"
                                ? "purple"
                                : inv.status === "overdue"
                                ? "red"
                                : "amber"
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: "10px" }}>{inv.due_date}</td>
                        <td>
                          {remaining > 0 ? (
                            <button
                              className="action-pill"
                              onClick={() => openPaymentModal(inv)}
                            >
                              Record Payment <ArrowUpRight size={12} />
                            </button>
                          ) : (
                            <span className="badge badge-green">
                              <CheckCircle2 size={11} /> PAID
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* TAB 2: SUBSCRIPTIONS */}
            {activeTab === "subscriptions" && (
              <table className="interactive-table">
                <thead>
                  <tr>
                    <th>Service Package</th>
                    <th>Client</th>
                    <th>Monthly Retainer</th>
                    <th>Billing Day</th>
                    <th>Status</th>
                    <th>Next Bill Date</th>
                    <th>Auto-Renew</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((sub) => (
                    <tr key={sub.id}>
                      <td>
                        <strong>{sub.service_name}</strong>
                      </td>
                      <td>{clientNameMap.get(sub.client_id) || sub.client_id}</td>
                      <td style={{ fontWeight: 700, fontSize: "13px" }}>{currency.format(sub.monthly_amount)} / mo</td>
                      <td>Day {sub.billing_day}</td>
                      <td>
                        <span className={`badge badge-${sub.status === "active" ? "green" : "amber"}`}>
                          {sub.status}
                        </span>
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: "10px" }}>{sub.next_billing_date}</td>
                      <td>{sub.auto_renew ? "Yes" : "Manual"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* TAB 3: PAYMENTS */}
            {activeTab === "payments" && (
              <table className="interactive-table">
                <thead>
                  <tr>
                    <th>Payment ID</th>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
                        No payment entries recorded yet.
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontFamily: "monospace", fontSize: "10px" }}>{p.id}</td>
                        <td style={{ fontFamily: "monospace", fontSize: "10px" }}>{p.payment_date}</td>
                        <td>{clientNameMap.get(p.client_id) || p.client_id}</td>
                        <td style={{ fontWeight: 700, color: "var(--green)" }}>{currency.format(p.amount)}</td>
                        <td>{p.method}</td>
                        <td style={{ fontFamily: "monospace", fontSize: "10px", color: "var(--muted)" }}>
                          {p.reference || "—"}
                        </td>
                        <td>
                          <span className="badge badge-green">
                            <ShieldCheck size={11} /> {p.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* TAB 4: BILLING ADJUSTMENTS */}
            {activeTab === "adjustments" && (
              <table className="interactive-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Adjustment Type</th>
                    <th>Impact Delta</th>
                    <th>Description</th>
                    <th>Applied</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
                        No billing adjustments recorded.
                      </td>
                    </tr>
                  ) : (
                    adjustments.map((a) => (
                      <tr key={a.id}>
                        <td>{clientNameMap.get(a.client_id) || a.client_id}</td>
                        <td style={{ textTransform: "capitalize" }}>{a.adjustment_type.replace("_", " ")}</td>
                        <td style={{ fontWeight: 600 }}>
                          {a.amount_delta !== 0 ? currency.format(a.amount_delta) : ""}
                          {a.days_delta !== 0 ? ` +${a.days_delta} days free` : ""}
                        </td>
                        <td>{a.description}</td>
                        <td>
                          <span className={`badge badge-${a.applied ? "green" : "amber"}`}>
                            {a.applied ? "APPLIED" : "PENDING"}
                          </span>
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: "10px" }}>{a.created_at.slice(0, 10)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* RECORD PAYMENT MODAL (Section 51 Partial Payment Engine) */}
      {showPaymentModal && (
        <PaymentModal
          invoices={invoices}
          clients={clients}
          selectedInvoice={selectedInvoiceForPayment}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedInvoiceForPayment(null);
          }}
          onSuccess={() => {
            setShowPaymentModal(false);
            setSelectedInvoiceForPayment(null);
            loadData();
          }}
        />
      )}

      {/* RECORD ADJUSTMENT MODAL (Section 53) */}
      {showAdjustmentModal && (
        <AdjustmentModal
          clients={clients}
          onClose={() => setShowAdjustmentModal(false)}
          onSuccess={() => {
            setShowAdjustmentModal(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// MODAL COMPONENTS
// --------------------------------------------------------------------------

function PaymentModal({
  invoices,
  clients,
  selectedInvoice: initialInvoice,
  onClose,
  onSuccess,
}: {
  invoices: Invoice[];
  clients: Client[];
  selectedInvoice: Invoice | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(
    initialInvoice?.id || invoices.find((i) => i.status !== "paid")?.id || invoices[0]?.id || ""
  );

  const currentInvoice = useMemo(() => {
    return invoices.find((i) => i.id === selectedInvoiceId) || null;
  }, [invoices, selectedInvoiceId]);

  const remainingBalance = useMemo(() => {
    if (!currentInvoice) return 0;
    return Math.max(0, Number(currentInvoice.total_amount) - Number(currentInvoice.amount_paid));
  }, [currentInvoice]);

  const [amount, setAmount] = useState<number>(remainingBalance);
  const [method, setMethod] = useState<string>("Stripe / Credit Card");
  const [reference, setReference] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAmount(remainingBalance);
  }, [remainingBalance]);

  // Section 51 Guard: Overpayment check
  const isOverpayment = amount > remainingBalance;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentInvoice) return;

    if (amount <= 0) {
      toast.error("Payment amount must be greater than $0.");
      return;
    }

    if (isOverpayment) {
      toast.error(`Payment cannot exceed remaining balance of $${remainingBalance.toFixed(2)}.`);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/data/payments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: currentInvoice.client_id,
          invoice_id: currentInvoice.id,
          amount,
          method,
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Payment of $${amount.toFixed(2)} recorded and invoice updated!`);
        onSuccess();
      } else {
        toast.error(data.error || "Payment recording failed.");
      }
    } catch {
      toast.error("Network error recording payment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="onboarding-modal panel neumorph" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">
              <span className="signal" /> PARTIAL PAYMENTS ENGINE / SECTION 51
            </div>
            <h2>Record Payment</h2>
            <p>Reconcile full or partial client payments against open invoices.</p>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Select Target Invoice</label>
            <select
              value={selectedInvoiceId}
              onChange={(e) => setSelectedInvoiceId(e.target.value)}
            >
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} — Total: ${inv.total_amount} (Paid: ${inv.amount_paid}) — {inv.status.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {currentInvoice && (
            <div className="panel neumorph" style={{ padding: "14px 16px", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <small className="muted">Total Invoice: ${currentInvoice.total_amount}</small>
                  <div style={{ color: "var(--green)", fontSize: "11px", fontWeight: 600 }}>
                    Already Paid: ${currentInvoice.amount_paid}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <small className="muted">REMAINING BALANCE</small>
                  <strong style={{ display: "block", fontSize: "20px", color: "var(--blue)" }}>
                    ${remainingBalance.toFixed(2)}
                  </strong>
                </div>
              </div>
            </div>
          )}

          <div className="form-row-2">
            <div className="form-group">
              <label>Payment Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                style={{
                  borderColor: isOverpayment ? "#ef4444" : undefined,
                }}
                required
              />
              {isOverpayment && (
                <small style={{ color: "#ef4444", fontSize: "10px", marginTop: "4px" }}>
                  Exceeds remaining balance by ${(amount - remainingBalance).toFixed(2)}! Overpayment rejected.
                </small>
              )}
            </div>

            <div className="form-group">
              <label>Payment Method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="Stripe / Credit Card">Stripe / Credit Card</option>
                <option value="Bank ACH Wire">Bank ACH Wire</option>
                <option value="Direct Transfer">Direct Transfer</option>
                <option value="Manual Check">Manual Check</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Reference / Transaction Hash</label>
            <input
              placeholder="e.g. ch_3N2q8c... or Wire Ref 8912"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Reconciliation Notes</label>
            <textarea
              rows={2}
              placeholder="Optional notes regarding this installment or payment confirmation..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary-cta" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary-cta"
              disabled={busy || isOverpayment || amount <= 0}
            >
              {busy ? "Reconciling..." : `Record Payment ($${amount.toFixed(2)})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdjustmentModal({
  clients,
  onClose,
  onSuccess,
}: {
  clients: Client[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [clientId, setClientId] = useState<string>(clients[0]?.id || "");
  const [type, setType] = useState<"free_days" | "discount_percent" | "fixed_credit" | "manual_waiver">("free_days");
  const [amountDelta, setAmountDelta] = useState<number>(0);
  const [daysDelta, setDaysDelta] = useState<number>(14);
  const [description, setDescription] = useState<string>("Complimentary onboarding extension");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/data/billing_adjustments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          adjustment_type: type,
          amount_delta: amountDelta,
          days_delta: daysDelta,
          description,
          applied: true,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Billing adjustment recorded in audit ledger.");
        onSuccess();
      } else {
        toast.error(data.error || "Failed to record adjustment.");
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
              <span className="signal" /> BILLING ADJUSTMENTS / SECTION 53
            </div>
            <h2>Record Billing Adjustment</h2>
            <p>Apply free days, credits, or fee waivers with full audit transparency.</p>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Client</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>Adjustment Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as any)}>
                <option value="free_days">Free Days (Grace / Extension)</option>
                <option value="fixed_credit">Fixed Credit ($ Credit)</option>
                <option value="discount_percent">Discount Percentage (%)</option>
                <option value="manual_waiver">Manual Fee Waiver</option>
              </select>
            </div>

            <div className="form-group">
              <label>{type === "free_days" ? "Days Added" : "Credit Amount ($)"}</label>
              {type === "free_days" ? (
                <input
                  type="number"
                  value={daysDelta}
                  onChange={(e) => setDaysDelta(Number(e.target.value))}
                />
              ) : (
                <input
                  type="number"
                  value={amountDelta}
                  onChange={(e) => setAmountDelta(Number(e.target.value))}
                />
              )}
            </div>
          </div>

          <div className="form-group">
            <label>Justification & Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. 14 free days granted during webhook migration"
              required
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary-cta" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="primary-cta" disabled={busy}>
              {busy ? "Applying..." : "Apply Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
