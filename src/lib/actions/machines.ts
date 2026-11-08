"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeTenant, AuthError } from "../auth";
import { getI18n } from "../i18n";
import { audit } from "../audit";
import { dbErrorCode } from "../utils";
import { isKnownProvider, getProvider } from "../hardware/registry";
import { ProviderNotConfiguredError, type DeviceRef, type SimConfig } from "../hardware/types";
import { SimulatorProvider } from "../hardware/simulator";
import { adminRpc, getEngineDeps } from "../rentals/deps";
import { handleDeviceEvent } from "../rentals/engine";
import { rpcOrThrow } from "../rpc";
import type { ActionState } from "../action-result";
import type { Dict } from "../i18n/format";

function errorFor(t: Dict, e: unknown): ActionState {
  if (e instanceof AuthError) return { ok: false, error: t.common.forbidden };
  const code = dbErrorCode(e);
  const known = code && (t.errors as Record<string, string>)[code];
  if (known) return { ok: false, error: known };
  if (String((e as Error)?.message ?? "").includes("machines_provider_device_id_key")) return { ok: false, error: t.machines.duplicateDevice };
  console.error("[machines]", e);
  return { ok: false, error: t.errors.generic };
}

const machineSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().trim().max(120).optional().transform((v) => v || null),
  deviceId: z.string().trim().min(1).max(120),
  provider: z.string().refine(isKnownProvider),
  model: z.string().trim().max(120).optional().transform((v) => v || null),
  locationId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  totalSlots: z.coerce.number().int().min(1).max(96),
});

export async function createMachine(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const parsed = machineSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: t.errors.VALIDATION };
  const v = parsed.data;
  try {
    const ctx = await authorizeTenant(v.tenantId, "manager");
    const simulated = v.provider === "simulator";
    const { data, error } = await ctx.supabase
      .from("machines")
      .insert({
        tenant_id: ctx.tenant.id,
        name: v.name,
        device_id: v.deviceId,
        provider: v.provider,
        manufacturer: simulated ? "Simulator" : "Shenzhen EMCC Technology (HeyCharge)",
        model: v.model ?? (simulated ? "SIM-8" : null),
        location_id: v.locationId,
        total_slots: v.totalSlots,
      })
      .select("id")
      .single();
    if (error) throw error;
    if (simulated) {
      await rpcOrThrow(adminRpc(), "sim_provision_machine", { p_machine: data.id, p_batteries: v.totalSlots });
    }
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: "machine.created", entityType: "machine", entityId: data.id, metadata: { provider: v.provider, device_id: v.deviceId } });
    revalidatePath(`/o/${ctx.tenant.slug}/machines`);
    return { ok: true, message: t.common.saved, data: { id: data.id } };
  } catch (e) {
    return errorFor(t, e);
  }
}

const updateSchema = z.object({
  tenantId: z.string().uuid(),
  machineId: z.string().uuid(),
  name: z.string().trim().max(120).optional().transform((v) => v || null),
  model: z.string().trim().max(120).optional().transform((v) => v || null),
  locationId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  state: z.enum(["active", "maintenance", "retired"]),
  notes: z.string().trim().max(2000).optional().transform((v) => v || null),
});

export async function updateMachine(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const parsed = updateSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: t.errors.VALIDATION };
  const v = parsed.data;
  try {
    const ctx = await authorizeTenant(v.tenantId, "manager");
    const { error, count } = await ctx.supabase
      .from("machines")
      .update({ name: v.name, model: v.model, location_id: v.locationId, state: v.state, notes: v.notes }, { count: "exact" })
      .eq("id", v.machineId)
      .eq("tenant_id", ctx.tenant.id);
    if (error) throw error;
    if (!count) return { ok: false, error: t.common.notFound };
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: "machine.updated", entityType: "machine", entityId: v.machineId, metadata: { state: v.state } });
    revalidatePath(`/o/${ctx.tenant.slug}/machines`);
    return { ok: true, message: t.common.saved };
  } catch (e) {
    return errorFor(t, e);
  }
}

async function loadMachine(tenantId: string, machineId: string) {
  const ctx = await authorizeTenant(tenantId, "manager");
  const { data: m } = await ctx.supabase
    .from("machines")
    .select("id, tenant_id, device_id, provider, is_simulated, sim_config, total_slots")
    .eq("id", machineId)
    .eq("tenant_id", ctx.tenant.id)
    .maybeSingle();
  if (!m) throw new AuthError("NOT_FOUND");
  const ref: DeviceRef = {
    machineId: m.id,
    tenantId: m.tenant_id,
    deviceId: m.device_id,
    isSimulated: m.is_simulated,
    simConfig: (m.sim_config ?? {}) as SimConfig,
  };
  return { ctx, m, ref };
}

/** Simulator controls — only valid for simulated machines; never touch real hardware or money. */
export async function simulatorAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const tenantId = String(fd.get("tenantId") ?? "");
  const machineId = String(fd.get("machineId") ?? "");
  const op = String(fd.get("op") ?? "");
  try {
    const { ctx, m, ref } = await loadMachine(tenantId, machineId);
    if (!m.is_simulated) return { ok: false, error: t.common.forbidden };
    const db = adminRpc();
    const sim = new SimulatorProvider(db);
    const deps = await getEngineDeps();
    const cfg = { ...(m.sim_config as SimConfig) };
    switch (op) {
      case "online":
      case "offline":
        cfg.offline = op === "offline";
        await ctx.supabase.from("machines").update({ sim_config: cfg }).eq("id", m.id);
        await handleDeviceEvent(deps, "simulator", sim.simulateConnection(ref, op));
        break;
      case "toggle_fail":
        cfg.unlock_failure = !cfg.unlock_failure;
        await ctx.supabase.from("machines").update({ sim_config: cfg }).eq("id", m.id);
        break;
      case "toggle_async":
        cfg.unlock_async = !cfg.unlock_async;
        await ctx.supabase.from("machines").update({ sim_config: cfg }).eq("id", m.id);
        break;
      case "refill":
        await rpcOrThrow(db, "sim_provision_machine", { p_machine: m.id, p_batteries: m.total_slots });
        break;
      case "return": {
        const serial = String(fd.get("serial") ?? "");
        const rentalTenant = await ctx.supabase.from("rentals").select("id").eq("tenant_id", ctx.tenant.id).eq("battery_serial", serial).in("status", ["active", "overdue"]).maybeSingle();
        if (!rentalTenant.data) return { ok: false, error: t.common.notFound };
        const ev = await sim.simulateReturn(ref, serial);
        await handleDeviceEvent(deps, "simulator", ev);
        break;
      }
      case "confirm_pending": {
        const rentalId = String(fd.get("rentalId") ?? "");
        const { data: r } = await ctx.supabase.from("rentals").select("id, provider_rental_ref").eq("id", rentalId).eq("tenant_id", ctx.tenant.id).eq("status", "pending").maybeSingle();
        if (!r) return { ok: false, error: t.common.notFound };
        const st = await sim.getRentalStatus(r.provider_rental_ref ?? `sim-${r.id}`, ref);
        if (st.state !== "released" || !st.batterySerial) return { ok: false, error: t.errors.NO_BATTERIES };
        await handleDeviceEvent(deps, "simulator", {
          type: "battery_released",
          deviceId: m.device_id,
          rentalRef: r.id,
          batterySerial: st.batterySerial,
          slot: st.slot ?? null,
          occurredAt: new Date().toISOString(),
          externalId: `sim-release-${r.id}`,
        });
        break;
      }
      default:
        return { ok: false, error: t.errors.VALIDATION };
    }
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: `simulator.${op}`, entityType: "machine", entityId: m.id });
    revalidatePath(`/o/${ctx.tenant.slug}/machines/${m.id}`);
    return { ok: true, message: t.common.saved };
  } catch (e) {
    return errorFor(t, e);
  }
}

/** Ask the hardware provider for the live device status. */
export async function refreshMachineStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  try {
    const { ctx, m, ref } = await loadMachine(String(fd.get("tenantId")), String(fd.get("machineId")));
    const provider = getProvider(m.provider, adminRpc());
    const status = await provider.getDeviceStatus(ref);
    await rpcOrThrow(adminRpc(), "machine_set_connection", { p_machine: m.id, p_status: status.connection, p_source: m.is_simulated ? "simulator" : "provider", p_external_id: null });
    revalidatePath(`/o/${ctx.tenant.slug}/machines/${m.id}`);
    return { ok: true, message: t.common.saved };
  } catch (e) {
    if (e instanceof ProviderNotConfiguredError) return { ok: false, error: t.machines.providerNotReadyBody };
    return errorFor(t, e);
  }
}
