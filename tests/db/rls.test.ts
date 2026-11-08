/**
 * Tenant-isolation & role-permission tests against a REAL Postgres with the
 * exact production migrations applied (see scripts/db-local.sh).
 * Run with: npm run test:db
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { randomUUID, createHash, randomBytes } from "node:crypto";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

type Actor = { id: string; email: string };

let db: Client;
const users: Record<string, Actor> = {};
const tenants: Record<string, string> = {};

async function asUser<T>(actor: Actor | null, fn: (c: Client) => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    if (actor) {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: actor.id, role: "authenticated", email: actor.email }),
      ]);
    } else {
      await db.query("set local role anon");
      await db.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)");
    }
    const out = await fn(db);
    await db.query("commit");
    return out;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

async function createUser(key: string, superAdmin = false) {
  const id = randomUUID();
  const email = `${key}-${id.slice(0, 6)}@test.local`;
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  if (superAdmin) await db.query("update public.profiles set is_super_admin = true where id = $1", [id]);
  users[key] = { id, email };
  return users[key];
}

async function addMember(tenant: string, user: Actor, role: string) {
  await db.query("insert into public.memberships (tenant_id, user_id, role) values ($1, $2, $3)", [tenant, user.id, role]);
}

d("RLS tenant isolation", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("update public.plans set is_active = true where code in ('starter', 'growth', 'pro')");
    await createUser("ownerA");
    await createUser("ownerB");
    await createUser("managerA");
    await createUser("employeeA");
    await createUser("outsider");
    await createUser("admin", true);
    const a = await db.query("select public.provision_tenant('Alpha Power', $1, 'starter', $2) id", [
      `alpha-${randomBytes(3).toString("hex")}`, users.ownerA.id,
    ]);
    const b = await db.query("select public.provision_tenant('Beta Charge', $1, 'growth', $2) id", [
      `beta-${randomBytes(3).toString("hex")}`, users.ownerB.id,
    ]);
    tenants.A = a.rows[0].id;
    tenants.B = b.rows[0].id;
    await addMember(tenants.A, users.managerA, "manager");
    await addMember(tenants.A, users.employeeA, "employee");
    // seed one machine + location per tenant as service (postgres)
    for (const t of ["A", "B"]) {
      const loc = await db.query(
        "insert into public.locations (tenant_id, name) values ($1, $2) returning id", [tenants[t], `Loc ${t}`]);
      await db.query(
        `insert into public.machines (tenant_id, location_id, device_id, is_simulated, total_slots, available_batteries)
         values ($1, $2, $3, true, 8, 8)`, [tenants[t], loc.rows[0].id, `SIM-${t}-${randomBytes(2).toString("hex")}`]);
    }
    await db.query(
      "update public.integrations set credentials_encrypted = 'secret-blob' where tenant_id = $1", [tenants.B]);
  });

  afterAll(async () => {
    await db?.end();
  });

  it("owner sees only their own tenant", async () => {
    const rows = await asUser(users.ownerA, (c) => c.query("select id from public.tenants"));
    expect(rows.rows.map((r) => r.id)).toEqual([tenants.A]);
  });

  it("owner cannot read another tenant's machines, locations, brands or pricing", async () => {
    for (const table of ["machines", "locations", "brands", "rental_pricing", "subscriptions"]) {
      const r = await asUser(users.ownerA, (c) =>
        c.query(`select count(*)::int n from public.${table} where tenant_id = $1`, [tenants.B]));
      expect(r.rows[0].n, table).toBe(0);
    }
  });

  it("owner cannot update or delete another tenant's machines", async () => {
    const upd = await asUser(users.ownerA, (c) =>
      c.query("update public.machines set notes = 'hacked' where tenant_id = $1", [tenants.B]));
    expect(upd.rowCount).toBe(0);
    const del = await asUser(users.ownerA, (c) =>
      c.query("delete from public.locations where tenant_id = $1", [tenants.B]));
    expect(del.rowCount).toBe(0);
  });

  it("owner cannot insert rows into another tenant", async () => {
    await expect(
      asUser(users.ownerA, (c) =>
        c.query("insert into public.locations (tenant_id, name) values ($1, 'evil')", [tenants.B])),
    ).rejects.toThrow(/row-level security/);
  });

  it("manager can create machines; employee cannot", async () => {
    await asUser(users.managerA, (c) =>
      c.query("insert into public.machines (tenant_id, device_id) values ($1, $2)", [
        tenants.A, `SIM-M-${randomBytes(2).toString("hex")}`,
      ]));
    await expect(
      asUser(users.employeeA, (c) =>
        c.query("insert into public.machines (tenant_id, device_id) values ($1, 'X-EMP')", [tenants.A])),
    ).rejects.toThrow(/row-level security/);
    const read = await asUser(users.employeeA, (c) =>
      c.query("select count(*)::int n from public.machines where tenant_id = $1", [tenants.A]));
    expect(read.rows[0].n).toBeGreaterThan(0);
  });

  it("employees cannot read payments, integrations or subscriptions; managers can", async () => {
    await db.query(
      "insert into public.payments (tenant_id, amount_authorized_cents, status, provider, is_simulated) values ($1, 500, 'authorized', 'simulated', true)",
      [tenants.A]);
    const emp = await asUser(users.employeeA, (c) => c.query("select count(*)::int n from public.payments"));
    expect(emp.rows[0].n).toBe(0);
    const empInt = await asUser(users.employeeA, (c) => c.query("select count(*)::int n from public.integrations"));
    expect(empInt.rows[0].n).toBe(0);
    const mgr = await asUser(users.managerA, (c) => c.query("select count(*)::int n from public.payments"));
    expect(mgr.rows[0].n).toBe(1);
  });

  it("encrypted provider credentials are never selectable by browser roles", async () => {
    await expect(
      asUser(users.ownerB, (c) => c.query("select credentials_encrypted from public.integrations")),
    ).rejects.toThrow(/permission denied/);
  });

  it("users cannot make themselves super admin or change tenant status/plan", async () => {
    await expect(
      asUser(users.ownerA, (c) =>
        c.query("update public.profiles set is_super_admin = true where id = $1", [users.ownerA.id])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(users.ownerA, (c) => c.query("update public.tenants set status = 'active', plan_id = null")),
    ).rejects.toThrow(/permission denied/);
  });

  it("owners cannot write payments, rentals or audit logs directly", async () => {
    await expect(
      asUser(users.ownerA, (c) =>
        c.query("insert into public.payments (tenant_id, status) values ($1, 'succeeded')", [tenants.A])),
    ).rejects.toThrow(/row-level security|permission denied/);
    await expect(
      asUser(users.ownerA, (c) =>
        c.query("insert into public.audit_logs (tenant_id, action) values ($1, 'fake')", [tenants.A])),
    ).rejects.toThrow(/row-level security|permission denied/);
    const upd = await asUser(users.ownerA, (c) => c.query("update public.rentals set amount_cents = 0"));
    expect(upd.rowCount).toBe(0);
  });

  it("a machine cannot be assigned to another tenant's location", async () => {
    const locB = await db.query("select id from public.locations where tenant_id = $1 limit 1", [tenants.B]);
    await expect(
      db.query("insert into public.machines (tenant_id, location_id, device_id) values ($1, $2, 'CROSS-1')", [
        tenants.A, locB.rows[0].id,
      ]),
    ).rejects.toThrow(/foreign key/);
  });

  it("super admin has global read access", async () => {
    const r = await asUser(users.admin, (c) =>
      c.query("select count(*)::int n from public.tenants where id = any($1)", [[tenants.A, tenants.B]]));
    expect(r.rows[0].n).toBe(2);
    const stats = await asUser(users.admin, (c) => c.query("select public.platform_stats() s"));
    expect(stats.rows[0].s.tenants).toBeGreaterThanOrEqual(2);
  });

  it("platform stats are forbidden to operators", async () => {
    await expect(asUser(users.ownerA, (c) => c.query("select public.platform_stats()"))).rejects.toThrow(/FORBIDDEN/);
  });

  it("anonymous users can read public plans but no tenant data", async () => {
    const plans = await asUser(null, (c) => c.query("select code from public.plans order by sort_order"));
    expect(plans.rows.map((r) => r.code)).toEqual(["community"]); // paid plans are hidden in community mode
    await expect(asUser(null, (c) => c.query("select * from public.tenants"))).rejects.toThrow(/permission denied/);
  });

  it("outsiders see nothing", async () => {
    for (const table of ["tenants", "machines", "rentals", "customers", "memberships"]) {
      const r = await asUser(users.outsider, (c) => c.query(`select count(*)::int n from public.${table}`));
      expect(r.rows[0].n, table).toBe(0);
    }
  });

  it("plan machine limit is enforced server-side", async () => {
    // Starter allows 5 machines; tenant A already has 2.
    for (let i = 0; i < 3; i++) {
      await db.query("insert into public.machines (tenant_id, device_id) values ($1, $2)", [
        tenants.A, `LIM-${i}-${randomBytes(2).toString("hex")}`,
      ]);
    }
    await expect(
      db.query("insert into public.machines (tenant_id, device_id) values ($1, 'LIM-OVER')", [tenants.A]),
    ).rejects.toThrow(/MACHINE_LIMIT_REACHED/);
  });

  it("machines cannot be added when the subscription has lapsed", async () => {
    await db.query("update public.subscriptions set status = 'canceled' where tenant_id = $1", [tenants.B]);
    await expect(
      db.query("insert into public.machines (tenant_id, device_id) values ($1, 'LAPSED-1')", [tenants.B]),
    ).rejects.toThrow(/SUBSCRIPTION_INACTIVE/);
    await db.query("update public.subscriptions set status = 'active' where tenant_id = $1", [tenants.B]);
  });

  it("the last owner cannot be removed or demoted", async () => {
    await expect(
      db.query("update public.memberships set role = 'manager' where tenant_id = $1 and user_id = $2", [
        tenants.B, users.ownerB.id,
      ]),
    ).rejects.toThrow(/LAST_OWNER/);
  });

  it("managers cannot invite or promote owners", async () => {
    await expect(
      asUser(users.managerA, (c) =>
        c.query("insert into public.invitations (tenant_id, email, role, token_hash) values ($1, 'x@y.com', 'owner', 'h1')", [tenants.A])),
    ).rejects.toThrow(/FORBIDDEN_ROLE|row-level security/);
    await asUser(users.managerA, (c) =>
      c.query("insert into public.invitations (tenant_id, email, role, token_hash) values ($1, 'x@y.com', 'employee', $2)", [
        tenants.A, randomBytes(8).toString("hex"),
      ]));
    await expect(
      asUser(users.managerA, (c) =>
        c.query("update public.memberships set role = 'owner' where tenant_id = $1 and user_id = $2", [
          tenants.A, users.employeeA.id,
        ])),
    ).resolves.toMatchObject({ rowCount: 0 }); // managers have no membership update policy
  });

  it("suspended tenants become read-only for their members", async () => {
    await db.query("update public.tenants set status = 'suspended' where id = $1", [tenants.B]);
    await expect(
      asUser(users.ownerB, (c) =>
        c.query("insert into public.locations (tenant_id, name) values ($1, 'during suspension')", [tenants.B])),
    ).rejects.toThrow(/row-level security/);
    const read = await asUser(users.ownerB, (c) => c.query("select count(*)::int n from public.locations"));
    expect(read.rows[0].n).toBeGreaterThan(0);
    await db.query("update public.tenants set status = 'active' where id = $1", [tenants.B]);
  });

  it("invitations: token must match and email must match the signed-in user", async () => {
    const invitee = await createUser("invitee");
    const token = randomBytes(24).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");
    await db.query("insert into public.invitations (tenant_id, email, role, token_hash) values ($1, $2, 'manager', $3)", [
      tenants.B, invitee.email, hash,
    ]);
    await expect(asUser(users.outsider, (c) => c.query("select public.accept_invitation($1)", [token]))).rejects.toThrow(
      /INVITE_EMAIL_MISMATCH/,
    );
    await expect(asUser(invitee, (c) => c.query("select public.accept_invitation('wrong')"))).rejects.toThrow(/INVITE_INVALID/);
    const ok = await asUser(invitee, (c) => c.query("select public.accept_invitation($1) t", [token]));
    expect(ok.rows[0].t).toBe(tenants.B);
    const role = await db.query("select role from public.memberships where tenant_id = $1 and user_id = $2", [
      tenants.B, invitee.id,
    ]);
    expect(role.rows[0].role).toBe("manager");
    await expect(asUser(invitee, (c) => c.query("select public.accept_invitation($1)", [token]))).rejects.toThrow(/INVITE_USED/);
  });

  it("self-service creation requires the community access code and gets the free plan", async () => {
    const founder = await createUser("founder");
    const code = (await db.query("select value->>'access_code' c from public.platform_settings where key = 'signups'")).rows[0].c;
    expect(code).toMatch(/^[0-9A-F]{10}$/);
    await expect(
      asUser(founder, (c) => c.query("select public.create_my_tenant('Nope', $1, 'WRONG')", [`nope-${randomBytes(3).toString("hex")}`])),
    ).rejects.toThrow(/INVALID_ACCESS_CODE/);
    const r = await asUser(founder, (c) =>
      c.query("select public.create_my_tenant('Founder Co', $1, $2) id", [`founder-${randomBytes(3).toString("hex")}`, code.toLowerCase()]));
    const tid = r.rows[0].id;
    const m = await db.query("select role from public.memberships where tenant_id = $1 and user_id = $2", [tid, founder.id]);
    expect(m.rows[0].role).toBe("owner");
    const s = await db.query("select s.status, p.code, p.price_cents from public.subscriptions s join public.plans p on p.id = s.plan_id where s.tenant_id = $1", [tid]);
    expect(s.rows[0]).toMatchObject({ status: "active", code: "community", price_cents: 0 });
    await db.query("update public.platform_settings set value = value || '{\"self_serve_enabled\": false}' where key = 'signups'");
    await expect(
      asUser(founder, (c) => c.query("select public.create_my_tenant('Closed', $1, $2)", [`closed-${randomBytes(3).toString("hex")}`, code])),
    ).rejects.toThrow(/SIGNUPS_CLOSED/);
    await db.query("update public.platform_settings set value = value || '{\"self_serve_enabled\": true}' where key = 'signups'");
  });

  it("platform settings (access code) are hidden from operators", async () => {
    const r = await asUser(users.ownerA, (c) => c.query("select count(*)::int n from public.platform_settings"));
    expect(r.rows[0].n).toBe(0);
  });

  it("service-only functions cannot be called by operators", async () => {
    await expect(
      asUser(users.ownerA, (c) => c.query("select public.provision_tenant('x', 'xx-yy', 'starter', $1)", [users.ownerA.id])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(users.ownerA, (c) => c.query("select public.check_rate_limit('k', 1, 60)")),
    ).rejects.toThrow(/permission denied/);
  });

  it("analytics functions respect tenant isolation", async () => {
    const m = await db.query("select id, location_id from public.machines where tenant_id = $1 limit 1", [tenants.A]);
    await db.query(
      `insert into public.rentals (tenant_id, machine_id, location_id, status, payment_status, amount_cents, pricing_snapshot,
         started_at, returned_at, is_simulated)
       values ($1, $2, $3, 'returned', 'succeeded', 700, '{}', now() - interval '2 hours', now() - interval '1 hour', true)`,
      [tenants.A, m.rows[0].id, m.rows[0].location_id]);
    const own = await asUser(users.ownerA, (c) =>
      c.query("select public.analytics_summary($1, now() - interval '1 day', now() + interval '1 hour') s", [tenants.A]));
    expect(own.rows[0].s.revenue_cents).toBe(700);
    const other = await asUser(users.ownerB, (c) =>
      c.query("select public.analytics_summary($1, now() - interval '1 day', now() + interval '1 hour') s", [tenants.A]));
    expect(other.rows[0].s.revenue_cents).toBe(0);
    expect(other.rows[0].s.rentals).toBe(0);
    const real = await asUser(users.ownerA, (c) =>
      c.query("select public.analytics_summary($1, now() - interval '1 day', now() + interval '1 hour', 'real') s", [tenants.A]));
    expect(real.rows[0].s.revenue_cents).toBe(0); // the rental above is simulated
  });

  it("rate limiter blocks after the configured number of hits", async () => {
    const bucket = `t-${randomBytes(4).toString("hex")}`;
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await db.query("select public.check_rate_limit($1, 3, 60) ok", [bucket]);
      results.push(r.rows[0].ok);
    }
    expect(results).toEqual([true, true, true, false]);
  });
});

d("hardening", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
  });
  afterAll(async () => db?.end());
  it("browser roles cannot set simulation or telemetry columns; provider decides simulation", async () => {
    await expect(
      asUser(users.managerA, (c) =>
        c.query("insert into public.machines (tenant_id, device_id, provider, is_simulated) values ($1, 'X-SIM', 'heycharge', true)", [tenants.A])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(users.managerA, (c) =>
        c.query("insert into public.machines (tenant_id, device_id, connection_status) values ($1, 'X-ON', 'online')", [tenants.A])),
    ).rejects.toThrow(/permission denied/);
    const real = await db.query("insert into public.machines (tenant_id, device_id, provider) values ($1, $2, 'heycharge') returning is_simulated", [tenants.B, `HC-${randomBytes(2).toString("hex")}`]);
    expect(real.rows[0].is_simulated).toBe(false);
    await expect(db.query("update public.machines set is_simulated = true where provider = 'heycharge'")).resolves.toBeTruthy();
    const still = await db.query("select bool_or(is_simulated) s from public.machines where provider = 'heycharge'");
    expect(still.rows[0].s).toBe(false);
  });
});
