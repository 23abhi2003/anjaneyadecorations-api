import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings, Customer, Order, StaffMember, CompletionStatus } from "./types";
import { nextOrderId, uniqueSlug } from "./ids";
import { createToken, verifyToken, type AuthPayload } from "./auth";
import * as db from "./db";

const app = new Hono<{ Bindings: Bindings; Variables: { auth: AuthPayload } }>();

const DEFAULT_OWNER_PHONE = "7416411182";
const DEFAULT_OWNER_PIN = "1182";

app.use("*", async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? "*").split(",").map((s) => s.trim());
  const corsMiddleware = cors({
    origin: allowed.includes("*") ? "*" : allowed,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  });
  return corsMiddleware(c, next);
});

app.get("/", (c) => c.json({ ok: true, service: "anjaneya-backend" }));

// ---------------- auth ----------------
// Everything under /api/* except /api/auth/login requires a valid bearer
// token. The token itself encodes { role, phone, name, staffId? } — see
// src/auth.ts. Owner credentials are fixed (env-overridable); staff
// credentials are looked up by phone in the `staff` table.

app.post("/api/auth/login", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { role?: string; phone?: string; pin?: string };
  const role = body.role === "staff" ? "staff" : "owner";
  const phone = (body.phone || "").toString().trim();
  const pin = (body.pin || "").toString().trim();

  if (!phone || !pin) {
    return c.json({ error: "Phone number and PIN are required." }, 400);
  }

  if (role === "owner") {
    const ownerPhone = c.env.OWNER_PHONE || DEFAULT_OWNER_PHONE;
    const ownerPin = c.env.OWNER_PIN || DEFAULT_OWNER_PIN;
    if (phone !== ownerPhone || pin !== ownerPin) {
      return c.json({ error: "Invalid phone number or PIN." }, 401);
    }
    const token = await createToken(
      { role: "owner", phone: ownerPhone, name: "Owner" },
      c.env.AUTH_SECRET || "anjaneya-dev-secret"
    );
    return c.json({ token, user: { role: "owner", phone: ownerPhone, name: "Owner" } });
  }

  // Staff login
  const staff = await db.getStaffByPhone(c.env.DB, phone);
  if (!staff || !staff.pin || staff.pin !== pin) {
    return c.json({ error: "Invalid phone number or PIN." }, 401);
  }
  const token = await createToken(
    { role: "staff", phone: staff.phone || phone, name: staff.name || "Staff", staffId: staff.id },
    c.env.AUTH_SECRET || "anjaneya-dev-secret"
  );
  return c.json({ token, user: { role: "staff", phone: staff.phone, name: staff.name, staffId: staff.id } });
});

app.get("/api/auth/verify", async (c) => {
  const header = c.req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return c.json({ error: "No token." }, 401);
  const payload = await verifyToken(token, c.env.AUTH_SECRET || "anjaneya-dev-secret");
  if (!payload) return c.json({ error: "Invalid or expired token." }, 401);
  return c.json({
    user: { role: payload.role, phone: payload.phone, name: payload.name, staffId: payload.staffId },
  });
});

// Auth guard for every other /api/* route.
app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/auth/login" || c.req.path === "/api/auth/verify") return next();
  const header = c.req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return c.json({ error: "Sign in required." }, 401);
  const payload = await verifyToken(token, c.env.AUTH_SECRET || "anjaneya-dev-secret");
  if (!payload) return c.json({ error: "Sign in required." }, 401);
  c.set("auth", payload);
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
    staffAssigned: body.staffAssigned ?? [],
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

  // Staff cannot see or change invoice/amount data, or the payment-completion
  // flag — enforced here as well as in the UI.
  if (auth.role === "staff") {
    delete (body as Partial<Order>).invoice;
    delete (body as Partial<Order>).paymentCompletionStatus;
  }

  const existing = await db.getOrder(c.env.DB, c.req.param("id"));
  if (!existing) return c.json({ error: "Not found." }, 404);

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
