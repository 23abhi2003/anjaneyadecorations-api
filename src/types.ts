// Mirrors the frontend's lib/types.ts. Kept as `any`-friendly JSON blobs on
// purpose — the Worker's job is to persist/retrieve these records, not to
// re-validate every nested field. Basic shape checks happen in index.ts.

export interface HasId {
  id: string;
  [key: string]: unknown;
}

export type Order = HasId & {
  customer?: { name?: string; phone?: string; [k: string]: unknown };
  eventDate?: string | null;
  status?: "pending" | "confirmed" | "completed";
  createdAt?: string;
  staffAssigned?: Array<{ staffId: string; name: string; amount: string }>;
  program?: { type?: string; name?: string; imageUrl?: string };
  serviceType?: string;
};

export type Customer = HasId & {
  name?: string;
  phone?: string;
  type?: "new" | "older";
};

export type StaffMember = HasId & {
  name?: string;
  phone?: string;
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
};
