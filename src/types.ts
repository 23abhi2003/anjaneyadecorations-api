// Mirrors the frontend's lib/types.ts. Kept as `any`-friendly JSON blobs on
// purpose — the Worker's job is to persist/retrieve these records, not to
// re-validate every nested field. Basic shape checks happen in index.ts.

export interface HasId {
  id: string;
  [key: string]: unknown;
}

export type CompletionStatus = "pending" | "completed";

export type Order = HasId & {
  customer?: { name?: string; phone?: string; [k: string]: unknown };
  eventDate?: string | null;
  status?: "pending" | "confirmed" | "completed";
  /** Has the physical order (tent/decoration work) been completed? */
  orderCompletionStatus?: CompletionStatus;
  /** Has the invoice been paid in full? Owner-managed. */
  paymentCompletionStatus?: CompletionStatus;
  createdAt?: string;
  staffAssigned?: Array<{ staffId: string; name: string; amount: string }>;
  program?: { type?: string; name?: string; imageUrl?: string };
  serviceType?: string;
  invoice?: { totalAmount?: string; advancePaid?: string; dueAmount?: string; paymentType?: string };
};

export type Customer = HasId & {
  name?: string;
  phone?: string;
  type?: "new" | "older";
};

export type StaffMember = HasId & {
  name?: string;
  phone?: string;
  /** 4-digit login PIN. Never echoed back in list/get responses. */
  pin?: string;
  assignments?: Array<{
    orderId: string;
    program: string;
    customerName: string;
    amount: string;
    date?: string;
  }>;
};

export type Bindings = {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
  /** Secret used to sign auth tokens. Set a real value via `wrangler secret put AUTH_SECRET` in production. */
  AUTH_SECRET?: string;
  /** Hardcoded owner login credentials (phone + 4-digit PIN). */
  OWNER_PHONE?: string;
  OWNER_PIN?: string;
};
