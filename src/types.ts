// Mirrors the frontend's lib/types.ts. Kept as `any`-friendly JSON blobs on
// purpose — the Worker's job is to persist/retrieve these records, not to
// re-validate every nested field. Basic shape checks happen in index.ts.

export interface HasId {
  id: string;
  [key: string]: unknown;
}

export type CompletionStatus = "pending" | "completed";

/** Has the owner fully settled what this staff member is owed for one job? */
export type StaffPaymentStatus = "due" | "paid";

/** One advance the owner handed to a staff member before the final settlement. */
export interface StaffPayment {
  id: string;
  /** Rupees, as a string (like every other amount in the app). */
  amount: string;
  /** YYYY-MM-DD */
  date: string;
  /** "UPI" | "Cash" | "Other" */
  mode: string;
  note: string;
  createdAt?: string;
}

/**
 * Money a staff member borrowed from the owner. Unlike `StaffPayment` (an
 * advance against ONE order), a borrow belongs to the staff member as a whole:
 * it is deducted from the total of ALL their assigned orders.
 * remaining = sum(assignment amounts) - sum(borrows)
 */
export interface StaffBorrow {
  id: string;
  /** Rupees, as a string (like every other amount in the app). */
  amount: string;
  /** YYYY-MM-DD — the day the money was handed over. */
  date: string;
  /** Why they borrowed it. */
  reason: string;
  createdAt?: string;
}

/** One entry of `order.staffAssigned[]`. */
export interface StaffAssigned {
  staffId: string;
  name: string;
  amount: string;
  /** Server-owned. Missing on older orders -> treated as "due". */
  paymentStatus?: StaffPaymentStatus;
  /** Server-owned advance ledger. Missing on older orders -> []. */
  payments?: StaffPayment[];
}

export type Order = HasId & {
  customer?: { name?: string; phone?: string; [k: string]: unknown };
  eventDate?: string | null;
  status?: "pending" | "confirmed" | "completed";
  /** Has the physical order (tent/decoration work) been completed? */
  orderCompletionStatus?: CompletionStatus;
  /** Has the invoice been paid in full? Owner-managed. */
  paymentCompletionStatus?: CompletionStatus;
  createdAt?: string;
  staffAssigned?: StaffAssigned[];
  program?: { type?: string; name?: string; imageUrl?: string };
  serviceType?: string;
  invoice?: { totalAmount?: string; advancePaid?: string; dueAmount?: string; paymentType?: string };
};

export type Customer = HasId & {
  name?: string;
  phone?: string;
  type?: "new" | "older";
  /** Who referred this customer (free text). */
  referredBy?: string;
};

export type StaffMember = HasId & {
  name?: string;
  phone?: string;
  /** 4-digit login PIN. Never echoed back in list/get responses. */
  pin?: string;
  /** Server-owned borrow ledger. Missing on older staff records -> []. */
  borrows?: StaffBorrow[];
  assignments?: Array<{
    orderId: string;
    program: string;
    customerName: string;
    amount: string;
    date?: string;
    paymentStatus?: StaffPaymentStatus;
    payments?: StaffPayment[];
  }>;
};

export type Bindings = {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
  /** Owner login credentials (phone + 4-digit PIN). Set via `wrangler secret put` in production. */
  OWNER_PHONE?: string;
  OWNER_PIN?: string;
};