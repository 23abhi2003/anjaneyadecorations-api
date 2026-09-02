import type { Customer, Order, StaffMember } from "./types";
import { uniqueSlug } from "./ids";

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

/** Orders belonging to a given customer, matched by phone (preferred) or exact name. */
export async function listOrdersForCustomer(db: D1Database, customer: Customer): Promise<Order[]> {
  const all = await listOrders(db);
  const phone = (customer.phone || "").trim();
  const name = (customer.name || "").trim().toLowerCase();
  return all.filter((o) => {
    const oc = (o.customer ?? {}) as { name?: string; phone?: string };
    if (phone && oc.phone && oc.phone.trim() === phone) return true;
    if (!phone && oc.name && oc.name.trim().toLowerCase() === name) return true;
    return false;
  });
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

export async function getCustomer(db: D1Database, id: string): Promise<Customer | null> {
  const row = await db.prepare("SELECT data FROM customers WHERE id = ?").bind(id).first<{ data: string }>();
  return row ? (JSON.parse(row.data) as Customer) : null;
}

export async function insertCustomer(db: D1Database, customer: Customer): Promise<void> {
  await db
    .prepare(`INSERT INTO customers (id, name, phone, data) VALUES (?, ?, ?, ?)`)
    .bind(customer.id, customer.name ?? "", customer.phone ?? "", JSON.stringify(customer))
    .run();
}

/**
 * Called after every order create/update. Looks for an existing customer by
 * phone (preferred) or exact name; if none exists, auto-creates one from the
 * order's customer info. Keeps the Customers page in sync with orders
 * without staff having to double-enter anyone.
 */
export async function ensureCustomerFromOrder(
  db: D1Database,
  orderCustomer: { name?: string; phone?: string; type?: string; address?: string; location?: unknown } | undefined
): Promise<void> {
  const name = (orderCustomer?.name || "").trim();
  if (!name) return;
  const phone = (orderCustomer?.phone || "").trim();

  const all = await listCustomers(db);
  const existing = all.find((c) => {
    if (phone && c.phone && c.phone.trim() === phone) return true;
    if (!phone && c.name && c.name.trim().toLowerCase() === name.toLowerCase()) return true;
    return false;
  });
  if (existing) {
    // Backfill a phone number onto an older record that didn't have one yet.
    if (phone && !existing.phone) {
      const merged: Customer = { ...existing, phone };
      await db.prepare(`UPDATE customers SET phone = ?, data = ? WHERE id = ?`).bind(phone, JSON.stringify(merged), existing.id).run();
    }
    return;
  }

  const existingIds = all.map((c) => c.id);
  const id = uniqueSlug(name, existingIds);
  const customer: Customer = {
    id,
    name,
    phone,
    type: (orderCustomer?.type as Customer["type"]) || "new",
    address: orderCustomer?.address as string | undefined,
    location: (orderCustomer?.location ?? null) as Customer["location"],
  } as Customer;
  await insertCustomer(db, customer);
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

/** Looks up a staff member by phone number, for staff login. */
export async function getStaffByPhone(db: D1Database, phone: string): Promise<StaffMember | null> {
  const normalized = (phone || "").trim();
  if (!normalized) return null;
  const row = await db
    .prepare("SELECT data FROM staff WHERE phone = ? LIMIT 1")
    .bind(normalized)
    .first<{ data: string }>();
  return row ? (JSON.parse(row.data) as StaffMember) : null;
}

export async function insertStaff(db: D1Database, staff: StaffMember): Promise<void> {
  await db
    .prepare(`INSERT INTO staff (id, name, phone, pin, data) VALUES (?, ?, ?, ?, ?)`)
    .bind(staff.id, staff.name ?? "", staff.phone ?? "", staff.pin ?? "", JSON.stringify(staff))
    .run();
}

/** Updates a staff member's own profile fields (name/phone/pin) — not their assignments. */
export async function updateStaffProfile(
  db: D1Database,
  id: string,
  patch: { name?: string; phone?: string; pin?: string }
): Promise<StaffMember | null> {
  const existing = await getStaff(db, id);
  if (!existing) return null;
  const merged: StaffMember = { ...existing, ...patch };
  await db
    .prepare(`UPDATE staff SET name = ?, phone = ?, pin = ?, data = ? WHERE id = ?`)
    .bind(merged.name ?? "", merged.phone ?? "", merged.pin ?? "", JSON.stringify(merged), id)
    .run();
  return merged;
}

export async function updateStaffAssignments(db: D1Database, id: string, assignments: StaffMember["assignments"]): Promise<void> {
  const existing = await getStaff(db, id);
  if (!existing) return;
  const merged: StaffMember = { ...existing, assignments };
  await db.prepare(`UPDATE staff SET data = ? WHERE id = ?`).bind(JSON.stringify(merged), id).run();
}

/**
 * Keeps every staff member's `assignments` array in sync with a single order.
 *
 * For every staff member: drops any existing assignment record for this order,
 * then — if that staff member is currently assigned on the order — re-adds a
 * fresh record with the order's latest program/customer/amount/date.
 *
 * Call this after both creating AND updating an order, so re-assigning staff,
 * changing someone's amount, or removing a staff member from an order is
 * immediately reflected on the Staff page — not just at order-creation time.
 */
export async function syncStaffAssignmentsForOrder(db: D1Database, order: Order): Promise<void> {
  const allStaff = await listStaff(db);
  const assignedByStaffId = new Map((order.staffAssigned ?? []).map((a) => [a.staffId, a]));
  const customerName = (order.customer as { name?: string } | undefined)?.name ?? "";
  const program = order.program?.type || order.serviceType || "";
  const date = order.eventDate || order.createdAt;

  for (const staff of allStaff) {
    const existingAssignments = staff.assignments ?? [];
    const withoutThisOrder = existingAssignments.filter((a) => a.orderId !== order.id);
    const hadThisOrder = withoutThisOrder.length !== existingAssignments.length;
    const currentAssignment = assignedByStaffId.get(staff.id);

    // Nothing to change for this staff member: they weren't on this order before
    // and aren't on it now.
    if (!hadThisOrder && !currentAssignment) continue;

    const nextAssignments = currentAssignment
      ? [
          ...withoutThisOrder,
          {
            orderId: order.id,
            program,
            customerName,
            amount: currentAssignment.amount || "",
            date,
          },
        ]
      : withoutThisOrder;

    await updateStaffAssignments(db, staff.id, nextAssignments);
  }
}

/** Strips any assignment records referencing a deleted order, from every staff member. */
export async function removeOrderFromAllStaffAssignments(db: D1Database, orderId: string): Promise<void> {
  const allStaff = await listStaff(db);
  for (const staff of allStaff) {
    const existing = staff.assignments ?? [];
    const filtered = existing.filter((a) => a.orderId !== orderId);
    if (filtered.length !== existing.length) {
      await updateStaffAssignments(db, staff.id, filtered);
    }
  }
}
