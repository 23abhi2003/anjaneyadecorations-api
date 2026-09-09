import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings, Customer, Order, StaffMember, CompletionStatus } from "./types";
import { nextOrderId, uniqueSlug } from "./ids";
import * as db from "./db";

export type Role = "owner" | "staff";

/**
 * No more signed tokens. The login endpoint just checks phone+PIN and hands
 * back a `user` object; the frontend keeps that in localStorage and resends
 * the role/staffId as plain headers on every request. This is intentionally
 * NOT cryptographically secure (anyone could set these headers by hand) —
 * that trade-off was a deliberate choice to drop the bearer-token machinery
 * that kept causing 401s. The role checks below (owner-only delete, etc.)
 * are business-logic conveniences for the normal app UI, not a security
 * boundary.
 */
interface CallerInfo {
  role: Role;
  staffId?: string;
}

const app = new Hono<{ Bindings: Bindings; Variables: { auth: CallerInfo } }>();

const DEFAULT_OWNER_PHONE = "9704452180";
const DEFAULT_OWNER_PIN = "1982";

app.use("*", async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? "*").split(",").map((s) => s.trim());
  const corsMiddleware = cors({
    origin: allowed.includes("*") ? "*" : allowed,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-User-Role", "X-User-Staff-Id"],
  });
  return corsMiddleware(c, next);
});

app.get("/", (c) => c.json({ ok: true, service: "anjaneya-backend" }));

// ---------------- auth ----------------
// Login just validates credentials and returns who you are. No token, no
// session — the frontend remembers `user` itself and resends it via headers.
// Owner credentials are fixed (env-overridable); staff credentials are
// looked up by phone in the `staff` table.

app.post("/api/auth/login", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { phone?: string; pin?: string };
  const phone = (body.phone || "").toString().trim();
  const pin = (body.pin || "").toString().trim();

  if (!phone || !pin) {
    return c.json({ error: "Phone number and PIN are required." }, 400);
  }

  // Role is no longer something the caller declares — it's determined by
  // whose phone number this is. This removes an entire class of "picked the
  // wrong tab" login failures: whoever's phone matches gets signed in as
  // the right role automatically, with no ambiguity.
  const ownerPhone = c.env.OWNER_PHONE || DEFAULT_OWNER_PHONE;
  const ownerPin = c.env.OWNER_PIN || DEFAULT_OWNER_PIN;
  if (phone === ownerPhone) {
    if (pin !== ownerPin) {
      return c.json({ error: "Invalid phone number or PIN." }, 401);
    }
    return c.json({ user: { role: "owner", phone: ownerPhone, name: "Owner" } });
  }

  const staff = await db.getStaffByPhone(c.env.DB, phone);
  if (!staff || !staff.pin || staff.pin !== pin) {
    return c.json({ error: "Invalid phone number or PIN." }, 401);
  }
  return c.json({ user: { role: "staff", phone: staff.phone, name: staff.name, staffId: staff.id } });
});

// Every other /api/* route reads the caller's role/staffId off plain headers
// (sent by lib/api.ts on every request). No header present -> treated as
// "owner" so direct API testing (curl, Postman) still sees full data by
// default, matching the old no-auth behavior of this API.
app.use("/api/*", async (c, next) => {
  const headerRole = c.req.header("X-User-Role");
  const role: Role = headerRole === "staff" ? "staff" : "owner";
  const staffId = c.req.header("X-User-Staff-Id") || undefined;
  c.set("auth", { role, staffId });
  return next();
});

/** Strip financial fields from an order before sending it to a staff user. */
function redactInvoiceForStaff(order: Order): Order {
  const { invoice, ...rest } = order;
  void invoice;
  return { ...rest, invoice: { totalAmount: "", advancePaid: "", dueAmount: "", paymentType: "" } } as Order;
}

/** Recomputes the overall order status from the two completion flags, when present. */
function computeOverallStatus(order: Order): Order["status"] {
  const orderDone = order.orderCompletionStatus === "completed";
  const paymentDone = order.paymentCompletionStatus === "completed";
  if (orderDone && paymentDone) return "completed";
  if (order.orderCompletionStatus || order.paymentCompletionStatus || order.status === "confirmed") {
    return order.status === "completed" ? "confirmed" : order.status || "confirmed";
  }
  return order.status || "pending";
}

// ---------------- orders ----------------

app.get("/api/orders", async (c) => {
  const auth = c.get("auth");
  const orders = await db.listOrders(c.env.DB);
  return c.json(auth.role === "staff" ? orders.map(redactInvoiceForStaff) : orders);
});

app.post("/api/orders", async (c) => {
  const auth = c.get("auth");
  const body = (await c.req.json().catch(() => ({}))) as Partial<Order>;

  if (!body.customer?.name?.toString().trim()) {
    return c.json({ error: "Customer name is required." }, 400);
  }

  const maxSeq = await db.maxOrderSeq(c.env.DB);
  const { id, seq } = nextOrderId(maxSeq);

  const orderCompletionStatus: CompletionStatus = body.orderCompletionStatus === "completed" ? "completed" : "pending";
  const paymentCompletionStatus: CompletionStatus = body.paymentCompletionStatus === "completed" ? "completed" : "pending";

  const order: Order = {
    id,
    customer: {
      name: body.customer.name,
      phone: body.customer.phone ?? "",
      type: body.customer.type ?? "new",
      address: body.customer.address ?? "",
      location: body.customer.location ?? null,
    },
    serviceType: body.serviceType ?? "tenthouse",
    program: body.program ?? { type: "", name: "", imageUrl: "" },
    eventDate: body.eventDate ?? null,
    orderCompletionStatus,
    paymentCompletionStatus,
    status: "pending",
    createdAt: new Date().toISOString().slice(0, 10),
    tenthouse: body.tenthouse ?? null,
    decoration: body.decoration ?? null,
    // Staff can assign people to a job but can never set/charge an amount for
    // them — that's owner-only, enforced server-side (not just hidden in the
    // UI) so a direct API call can't sneak an amount in either.
    staffAssigned: (body.staffAssigned ?? []).map((a) => ({
      ...a,
      amount: auth.role === "staff" ? "" : a.amount,
    })),
    invoice: body.invoice ?? { totalAmount: "", advancePaid: "", paymentType: "" },
    notes: body.notes ?? "",
  } as Order;
  order.status = computeOverallStatus(order);

  await db.insertOrder(c.env.DB, order, seq);
  await db.syncStaffAssignmentsForOrder(c.env.DB, order);
  // Requirement: when an order is placed, auto-add the name/phone to Customers too.
  await db.ensureCustomerFromOrder(c.env.DB, order.customer);

  return c.json(order, 201);
});

app.get("/api/orders/:id", async (c) => {
  const auth = c.get("auth");
  const order = await db.getOrder(c.env.DB, c.req.param("id"));
  if (!order) return c.json({ error: "Not found." }, 404);
  return c.json(auth.role === "staff" ? redactInvoiceForStaff(order) : order);
});

app.put("/api/orders/:id", async (c) => {
  const auth = c.get("auth");
  const body = (await c.req.json().catch(() => ({}))) as Partial<Order>;

  const existing = await db.getOrder(c.env.DB, c.req.param("id"));
  if (!existing) return c.json({ error: "Not found." }, 404);

  // Staff cannot see or change invoice/amount data, or the payment-completion
  // flag — enforced here as well as in the UI. Staff also cannot change who's
  // assigned to an order once it exists (add, remove, or re-charge) — only
  // the owner can edit staffAssigned on an update; whatever a staff caller
  // sends for it is dropped and the existing list is kept as-is.
  if (auth.role === "staff") {
    delete (body as Partial<Order>).invoice;
    delete (body as Partial<Order>).paymentCompletionStatus;
    delete (body as Partial<Order>).staffAssigned;
  }

  const merged: Order = { ...existing, ...body, id: existing.id };
  merged.status = computeOverallStatus(merged);

  const order = await db.updateOrder(c.env.DB, c.req.param("id"), merged);
  if (!order) return c.json({ error: "Not found." }, 404);
  await db.syncStaffAssignmentsForOrder(c.env.DB, order);
  await db.ensureCustomerFromOrder(c.env.DB, order.customer);

  return c.json(auth.role === "staff" ? redactInvoiceForStaff(order) : order);
});

app.delete("/api/orders/:id", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "owner") return c.json({ error: "Only the owner can delete orders." }, 403);
  const id = c.req.param("id");
  const ok = await db.deleteOrder(c.env.DB, id);
  if (!ok) return c.json({ error: "Not found." }, 404);
  await db.removeOrderFromAllStaffAssignments(c.env.DB, id);
  return c.json({ success: true });
});

// ---------------- customers ----------------

app.get("/api/customers", async (c) => {
  const customers = await db.listCustomers(c.env.DB);
  return c.json(customers);
});

app.post("/api/customers", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<Customer>;
  if (!body.name?.toString().trim()) {
    return c.json({ error: "Name is required." }, 400);
  }
  const existingIds = await db.listCustomerIds(c.env.DB);
  const id = uniqueSlug(body.name, existingIds);
  const customer: Customer = {
    id,
    name: body.name,
    phone: body.phone ?? "",
    type: body.type ?? "new",
    address: body.address ?? "",
    location: body.location ?? null,
  } as Customer;
  await db.insertCustomer(c.env.DB, customer);
  return c.json(customer, 201);
});

app.get("/api/customers/:id/orders", async (c) => {
  const auth = c.get("auth");
  const customer = await db.getCustomer(c.env.DB, c.req.param("id"));
  if (!customer) return c.json({ error: "Not found." }, 404);
  const orders = await db.listOrdersForCustomer(c.env.DB, customer);
  return c.json(auth.role === "staff" ? orders.map(redactInvoiceForStaff) : orders);
});

// ---------------- staff ----------------

app.get("/api/staff", async (c) => {
  const staff = await db.listStaff(c.env.DB);
  // Never send PINs back to the client.
  return c.json(staff.map(({ pin: _pin, ...rest }) => rest));
});

app.get("/api/staff/:id", async (c) => {
  const staff = await db.getStaff(c.env.DB, c.req.param("id"));
  if (!staff) return c.json({ error: "Not found." }, 404);
  const { pin: _pin, ...rest } = staff;
  return c.json(rest);
});

app.post("/api/staff", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "owner") return c.json({ error: "Only the owner can add staff." }, 403);

  const body = (await c.req.json().catch(() => ({}))) as Partial<StaffMember>;
  if (!body.name?.toString().trim()) {
    return c.json({ error: "Name is required." }, 400);
  }
  const existingIds = await db.listStaffIds(c.env.DB);
  const id = uniqueSlug(body.name, existingIds);
  const staff: StaffMember = {
    id,
    name: body.name,
    phone: body.phone ?? "",
    pin: body.pin ?? "",
    assignments: [],
  } as StaffMember;
  await db.insertStaff(c.env.DB, staff);
  const { pin: _pin, ...rest } = staff;
  return c.json(rest, 201);
});

// Owner-only: fix up a single assignment row shown on the Staff page (the
// amount owed to that staff member for one order, or the order/customer/date
// details attached to it). Assignments are a *derived* view of the order's
// `staffAssigned` list, so this writes back through to the order itself and
// then re-runs the same sync used on order create/update — that way the
// correction sticks instead of being silently overwritten next time the
// order is saved.
app.put("/api/staff/:staffId/assignments/:orderId", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "owner") {
    return c.json({ error: "Only the owner can edit assignment details." }, 403);
  }

  const staffId = c.req.param("staffId");
  const orderId = c.req.param("orderId");
  const body = (await c.req.json().catch(() => ({}))) as {
    amount?: string;
    date?: string;
    program?: string;
    customerName?: string;
  };

  const order = await db.getOrder(c.env.DB, orderId);
  if (!order) return c.json({ error: "Order not found." }, 404);

  const staffAssigned = [...(order.staffAssigned ?? [])];
  const idx = staffAssigned.findIndex((a) => a.staffId === staffId);
  if (idx === -1) {
    return c.json({ error: "This staff member is not assigned to that order." }, 404);
  }

  if (typeof body.amount === "string") {
    staffAssigned[idx] = { ...staffAssigned[idx], amount: body.amount.trim() };
  }

  const patch: Partial<Order> = { staffAssigned };
  if (typeof body.date === "string" && body.date.trim()) {
    patch.eventDate = body.date.trim();
  }
  if (typeof body.customerName === "string" && body.customerName.trim()) {
    patch.customer = { ...(order.customer ?? {}), name: body.customerName.trim() };
  }
  if (typeof body.program === "string" && body.program.trim()) {
    patch.program = { ...(order.program ?? {}), type: body.program.trim() };
  }

  const updated = await db.updateOrder(c.env.DB, orderId, patch);
  if (!updated) return c.json({ error: "Not found." }, 404);
  await db.syncStaffAssignmentsForOrder(c.env.DB, updated);

  const staff = await db.getStaff(c.env.DB, staffId);
  if (!staff) return c.json({ error: "Staff not found." }, 404);
  const { pin: _pin, ...rest } = staff;
  return c.json(rest);
});

app.put("/api/staff/:id", async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  // Owner can edit anyone. A staff member may only edit their own profile.
  if (auth.role !== "owner" && auth.staffId !== id) {
    return c.json({ error: "You can only edit your own profile." }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<StaffMember>;
  const patch: { name?: string; phone?: string; pin?: string } = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.phone === "string") patch.phone = body.phone;
  if (typeof body.pin === "string") patch.pin = body.pin;
  const updated = await db.updateStaffProfile(c.env.DB, id, patch);
  if (!updated) return c.json({ error: "Not found." }, 404);
  const { pin: _pin, ...rest } = updated;
  return c.json(rest);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error." }, 500);
});

export default app;