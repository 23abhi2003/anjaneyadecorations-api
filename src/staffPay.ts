import type { StaffAssigned, StaffPayment, StaffPaymentStatus } from "./types";

/**
 * Staff payout rules (paid / due + advances).
 *
 * Source of truth: each entry of `order.staffAssigned[]` carries
 *   - amount         total owed to that staff member for the job
 *   - paymentStatus  "due" | "paid"   ("paid" = fully settled)
 *   - payments[]     advances the owner already handed over (date/mode/note)
 *
 * The Staff page's `assignments[]` is only a derived copy of this, rebuilt
 * by db.syncStaffAssignmentsForOrder().
 */

export const PAYMENT_MODES = ["UPI", "Cash", "Other"] as const;

/** Tolerance for floating point / paise rounding when comparing rupee amounts. */
const EPS = 0.005;

export function toAmount(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/** Normalises a number to a tidy string ("500", "1250.5") — amounts are stored as strings app-wide. */
export function money(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function sumPayments(payments?: StaffPayment[]): number {
  return (payments ?? []).reduce((sum, p) => sum + toAmount(p.amount), 0);
}

export function coerceStatus(v: unknown): StaffPaymentStatus {
  return v === "paid" ? "paid" : "due";
}

export function cleanMode(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return (PAYMENT_MODES as readonly string[]).includes(s) ? s : "Other";
}

export function cleanNote(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 200) : "";
}

/** Accepts YYYY-MM-DD only; falls back to today (server date) if missing/invalid. */
export function cleanDate(v: unknown): string {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  return new Date().toISOString().slice(0, 10);
}

/**
 * If the advances given already cover the full amount, the assignment is
 * settled -> "paid". Callers decide WHEN to apply this (see below) so it never
 * overrides a status the owner picked explicitly.
 */
export function settleIfCovered(entry: StaffAssigned): StaffAssigned {
  const total = toAmount(entry.amount);
  if (entry.paymentStatus !== "paid" && total > 0 && sumPayments(entry.payments) >= total - EPS) {
    return { ...entry, paymentStatus: "paid" };
  }
  return entry;
}

/**
 * Payment fields are server-owned: whatever a client sends for `payments` /
 * `paymentStatus` inside `staffAssigned` is ignored, and the stored values for
 * the same staffId are carried over instead. That way saving an order from the
 * wizard (with a stale copy of the list) can never wipe or forge payment records.
 * The only ways to change them are the dedicated endpoints in index.ts.
 *
 * If the owner changed a staff member's amount in this save and existing
 * advances now cover it, the entry is settled ("paid").
 */
export function withServerOwnedPayFields(incoming: StaffAssigned[], existing: StaffAssigned[] | undefined): StaffAssigned[] {
  const previous = new Map((existing ?? []).map((a) => [a.staffId, a]));
  return incoming.map((a) => {
    const old = previous.get(a.staffId);
    const entry: StaffAssigned = {
      ...a,
      paymentStatus: coerceStatus(old?.paymentStatus),
      payments: old?.payments ?? [],
    };
    const amountChanged = !!old && money(toAmount(old.amount)) !== money(toAmount(a.amount));
    return amountChanged ? settleIfCovered(entry) : entry;
  });
}