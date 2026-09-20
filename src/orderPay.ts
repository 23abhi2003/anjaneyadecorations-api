import type { OrderInvoice, OrderPayment } from "./types";
import { money, toAmount } from "./staffPay";

/**
 * Customer payment rules for one order.
 *
 *   total      invoice.totalAmount            what the customer has to pay
 *   advance    invoice.advancePaid (+ date)   what they paid up front
 *   payments   invoice.payments[]             every later payment (date, mode, note)
 *   received   advance + sum(payments)
 *   due        total - received               never below 0
 *
 * Example: total 2000, advance 500, then 500 more on a later date
 *          -> received 1000, due 1000.
 *
 * `payments` is SERVER-OWNED (same idea as the staff payment ledger): whatever a
 * client sends for `invoice.payments` on create/update is ignored and the stored
 * list is kept. That way saving the order form (which holds a possibly stale
 * copy of the invoice) can never wipe or forge a payment record. The only ways
 * to change it are the dedicated endpoints in index.ts.
 */

/** Tolerance for floating point / paise rounding when comparing rupee amounts. */
export const EPS = 0.005;

export function sumOrderPayments(payments?: OrderPayment[]): number {
  return (payments ?? []).reduce((sum, p) => sum + toAmount(p.amount), 0);
}

/** Advance + every later payment. */
export function receivedTotal(invoice?: OrderInvoice): number {
  return toAmount(invoice?.advancePaid) + sumOrderPayments(invoice?.payments);
}

/** What the customer still owes. */
export function dueOf(invoice?: OrderInvoice): number {
  return Math.max(toAmount(invoice?.totalAmount) - receivedTotal(invoice), 0);
}

/** Accepts YYYY-MM-DD only. Unlike staff payments, a missing date stays blank instead of guessing "today". */
export function cleanAdvanceDate(v: unknown): string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : "";
}

/**
 * Builds the invoice that gets stored:
 *  - client-owned fields (total, advance, advance date, payment type) come from `incoming`
 *    when it is given, otherwise the stored ones are kept;
 *  - `payments` always comes from the stored invoice;
 *  - `dueAmount` is recomputed here, so it can never disagree with the ledger.
 */
export function buildInvoice(incoming: OrderInvoice | undefined, existing: OrderInvoice | undefined): OrderInvoice {
  const base: OrderInvoice = { ...(existing ?? {}), ...(incoming ?? {}) };
  const invoice: OrderInvoice = {
    totalAmount: base.totalAmount ?? "",
    advancePaid: base.advancePaid ?? "",
    advanceDate: cleanAdvanceDate(base.advanceDate),
    paymentType: base.paymentType ?? "",
    payments: existing?.payments ?? [],
  };
  invoice.dueAmount = money(dueOf(invoice));
  return invoice;
}