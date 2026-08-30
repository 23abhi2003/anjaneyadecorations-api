import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings, Customer, Order, StaffMember } from "./types";
import { nextOrderId, uniqueSlug } from "./ids";
import * as db from "./db";

const app = new Hono<{ Bindings: Bindings }>();

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

// ---------------- orders ----------------

app.get("/api/orders", async (c) => {
  const orders = await db.listOrders(c.env.DB);
  return c.json(orders);
});

app.post("/api/orders", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<Order>;

  if (!body.customer?.name?.toString().trim()) {
    return c.json({ error: "Customer name is required." }, 400);
  }

  const maxSeq = await db.maxOrderSeq(c.env.DB);
  const { id, seq } = nextOrderId(maxSeq);

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
    status: body.status ?? "pending",
    createdAt: new Date().toISOString().slice(0, 10),
    tenthouse: body.tenthouse ?? null,
    decoration: body.decoration ?? null,
    staffAssigned: body.staffAssigned ?? [],
    invoice: body.invoice ?? { totalAmount: "", advancePaid: "", paymentType: "" },
    notes: body.notes ?? "",
  } as Order;

  await db.insertOrder(c.env.DB, order, seq);
  await db.syncStaffAssignmentsForOrder(c.env.DB, order);

  return c.json(order, 201);
});

app.get("/api/orders/:id", async (c) => {
  const order = await db.getOrder(c.env.DB, c.req.param("id"));
  if (!order) return c.json({ error: "Not found." }, 404);
  return c.json(order);
});

app.put("/api/orders/:id", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<Order>;
  const order = await db.updateOrder(c.env.DB, c.req.param("id"), body);
  if (!order) return c.json({ error: "Not found." }, 404);
  await db.syncStaffAssignmentsForOrder(c.env.DB, order);
  return c.json(order);
});

app.delete("/api/orders/:id", async (c) => {
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

// ---------------- staff ----------------

app.get("/api/staff", async (c) => {
  const staff = await db.listStaff(c.env.DB);
  return c.json(staff);
});

app.post("/api/staff", async (c) => {
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
    assignments: [],
  } as StaffMember;
  await db.insertStaff(c.env.DB, staff);
  return c.json(staff, 201);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error." }, 500);
});

export default app;