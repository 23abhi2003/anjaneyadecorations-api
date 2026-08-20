import type { Customer, Order, StaffMember } from "./types";

// ---------- orders ----------

export async function listOrders(db: D1Database): Promise<Order[]> {
  const { results } = await db.prepare("SELECT data FROM orders ORDER BY inserted_at DESC, rowid DESC").all<{ data: string }>();
  return results.map((r) => JSON.parse(r.data) as Order);
}

export async function getOrder(db: D1Database, id: string): Promise<Order | null> {
  const row = await db.prepare("SELECT data FROM orders WHERE id = ?").bind(id).first<{ data: string }>();
  return row ? (JSON.parse(row.data) as Order) : null;
}

export async function maxOrderSeq(db: D1Database): Promise<number | null> {
  const row = await db.prepare("SELECT MAX(seq) as maxSeq FROM orders").first<{ maxSeq: number | null }>();
  return row?.maxSeq ?? null;
}

export async function insertOrder(db: D1Database, order: Order, seq: number): Promise<void> {
  const customer = (order.customer ?? {}) as { name?: string; phone?: string };
  await db
    .prepare(
      `INSERT INTO orders (id, customer_name, customer_phone, event_date, status, created_at, seq, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      order.id,
      customer.name ?? "",
      customer.phone ?? "",
      order.eventDate ?? null,
      order.status ?? "pending",
      order.createdAt ?? new Date().toISOString().slice(0, 10),
      seq,
      JSON.stringify(order)
    )
    .run();
}

export async function updateOrder(db: D1Database, id: string, patch: Partial<Order>): Promise<Order | null> {
  const existing = await getOrder(db, id);
  if (!existing) return null;
  const merged: Order = { ...existing, ...patch, id: existing.id };
  const customer = (merged.customer ?? {}) as { name?: string; phone?: string };
  await db
    .prepare(
      `UPDATE orders SET customer_name = ?, customer_phone = ?, event_date = ?, status = ?, data = ? WHERE id = ?`
    )
    .bind(customer.name ?? "", customer.phone ?? "", merged.eventDate ?? null, merged.status ?? "pending", JSON.stringify(merged), id)
    .run();
  return merged;
}

export async function deleteOrder(db: D1Database, id: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM orders WHERE id = ?").bind(id).run();
  return (res.meta.changes ?? 0) > 0;
}

// ---------- customers ----------

export async function listCustomers(db: D1Database): Promise<Customer[]> {
  const { results } = await db.prepare("SELECT data FROM customers ORDER BY inserted_at DESC, rowid DESC").all<{ data: string }>();
  return results.map((r) => JSON.parse(r.data) as Customer);
}

export async function listCustomerIds(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare("SELECT id FROM customers").all<{ id: string }>();
  return results.map((r) => r.id);
}

export async function insertCustomer(db: D1Database, customer: Customer): Promise<void> {
  await db
    .prepare(`INSERT INTO customers (id, name, phone, data) VALUES (?, ?, ?, ?)`)
    .bind(customer.id, customer.name ?? "", customer.phone ?? "", JSON.stringify(customer))
    .run();
}

// ---------- staff ----------

export async function listStaff(db: D1Database): Promise<StaffMember[]> {
  const { results } = await db.prepare("SELECT data FROM staff ORDER BY inserted_at DESC, rowid DESC").all<{ data: string }>();
  return results.map((r) => JSON.parse(r.data) as StaffMember);
}

export async function listStaffIds(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare("SELECT id FROM staff").all<{ id: string }>();
  return results.map((r) => r.id);
}

export async function getStaff(db: D1Database, id: string): Promise<StaffMember | null> {
  const row = await db.prepare("SELECT data FROM staff WHERE id = ?").bind(id).first<{ data: string }>();
  return row ? (JSON.parse(row.data) as StaffMember) : null;
}

export async function insertStaff(db: D1Database, staff: StaffMember): Promise<void> {
  await db
    .prepare(`INSERT INTO staff (id, name, phone, data) VALUES (?, ?, ?, ?)`)
    .bind(staff.id, staff.name ?? "", staff.phone ?? "", JSON.stringify(staff))
    .run();
}

export async function updateStaffAssignments(db: D1Database, id: string, assignments: StaffMember["assignments"]): Promise<void> {
  const existing = await getStaff(db, id);
  if (!existing) return;
  const merged: StaffMember = { ...existing, assignments };
  await db.prepare(`UPDATE staff SET data = ? WHERE id = ?`).bind(JSON.stringify(merged), id).run();
}
