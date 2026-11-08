import { describe, it, expect } from "vitest";
import { SimulatorProvider } from "@/lib/hardware/simulator";
import { HeyChargeProvider } from "@/lib/hardware/heycharge";
import { ProviderNotConfiguredError, type DeviceRef } from "@/lib/hardware/types";
import type { RpcClient } from "@/lib/rpc";

function fakeDb(state: { pick: { serial: string; slot: number } | null; free: number | null }): RpcClient {
  return {
    rpc: async (fn) => {
      if (fn === "sim_pick_battery") return { data: state.pick, error: null };
      if (fn === "sim_free_slot") return { data: state.free, error: null };
      if (fn === "sim_machine_state")
        return { data: { connection_status: "online", last_seen_at: null, total_slots: 8, available_batteries: state.pick ? 1 : 0, batteries: state.pick ? [{ serial: state.pick.serial, slot: state.pick.slot, charge_level: 90, status: "in_slot" }] : [] }, error: null };
      return { data: null, error: { message: "unknown" } };
    },
  };
}
const dev = (cfg = {}): DeviceRef => ({ machineId: "m", tenantId: "t", deviceId: "SIM-1", isSimulated: true, simConfig: cfg });

describe("simulator adapter", () => {
  it("confirms an unlock with a real battery from inventory", async () => {
    const sim = new SimulatorProvider(fakeDb({ pick: { serial: "SIM-A", slot: 3 }, free: 1 }));
    const r = await sim.unlockBattery({ device: dev(), rentalId: "r1", idempotencyKey: "r1:1" });
    expect(r).toEqual({ status: "confirmed", batterySerial: "SIM-A", slot: 3, providerRef: "sim-r1:1" });
  });
  it("fails when empty, offline, or configured to fail", async () => {
    const empty = new SimulatorProvider(fakeDb({ pick: null, free: 1 }));
    expect(await empty.unlockBattery({ device: dev(), rentalId: "r", idempotencyKey: "k" })).toMatchObject({ status: "failed", retryable: false });
    const sim = new SimulatorProvider(fakeDb({ pick: { serial: "S", slot: 1 }, free: 1 }));
    expect(await sim.unlockBattery({ device: dev({ offline: true }), rentalId: "r", idempotencyKey: "k" })).toMatchObject({ status: "failed", reason: "device_offline" });
    expect(await sim.unlockBattery({ device: dev({ unlock_failure: true }), rentalId: "r", idempotencyKey: "k" })).toMatchObject({ status: "failed", retryable: true });
    const unlucky = new SimulatorProvider(fakeDb({ pick: { serial: "S", slot: 1 }, free: 1 }), () => 0.1);
    expect(await unlucky.unlockBattery({ device: dev({ failure_rate: 0.5 }), rentalId: "r", idempotencyKey: "k" })).toMatchObject({ status: "failed" });
  });
  it("reports async unlocks as pending (never as released)", async () => {
    const sim = new SimulatorProvider(fakeDb({ pick: { serial: "S", slot: 1 }, free: 1 }));
    expect(await sim.unlockBattery({ device: dev({ unlock_async: true }), rentalId: "r9", idempotencyKey: "k" })).toEqual({ status: "pending", providerRef: "sim-r9" });
  });
  it("refuses to drive real (non-simulated) hardware", async () => {
    const sim = new SimulatorProvider(fakeDb({ pick: { serial: "S", slot: 1 }, free: 1 }));
    await expect(sim.unlockBattery({ device: { ...dev(), isSimulated: false }, rentalId: "r", idempotencyKey: "k" })).rejects.toThrow();
  });
  it("produces return events into a free slot with a unique id", async () => {
    const sim = new SimulatorProvider(fakeDb({ pick: null, free: 5 }));
    const a = await sim.simulateReturn(dev(), "SIM-A");
    const b = await sim.simulateReturn(dev(), "SIM-A");
    expect(a).toMatchObject({ type: "battery_returned", batterySerial: "SIM-A", slot: 5, deviceId: "SIM-1" });
    expect(a.externalId).not.toBe(b.externalId);
  });
  it("inventory lists every slot", async () => {
    const sim = new SimulatorProvider(fakeDb({ pick: { serial: "S", slot: 2 }, free: 1 }));
    const inv = await sim.getBatteryInventory(dev());
    expect(inv).toHaveLength(8);
    expect(inv[1]).toMatchObject({ slot: 2, serial: "S", status: "in_slot" });
    expect(inv[0].status).toBe("empty");
  });
});

describe("HeyCharge adapter (pending manufacturer docs)", () => {
  it("is explicitly not ready and never invents API calls", async () => {
    const hc = new HeyChargeProvider();
    expect(hc.isReady).toBe(false);
    await expect(hc.unlockBattery()).rejects.toBeInstanceOf(ProviderNotConfiguredError);
    await expect(hc.getDeviceStatus()).rejects.toBeInstanceOf(ProviderNotConfiguredError);
  });
});
