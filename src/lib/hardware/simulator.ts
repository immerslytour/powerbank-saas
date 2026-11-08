import { randomUUID } from "node:crypto";
import type {
  BatterySlot,
  DeviceDetails,
  DeviceRef,
  DeviceStatus,
  HardwareProvider,
  NormalizedDeviceEvent,
  ProviderRentalStatus,
  ReturnStatus,
  UnlockRequest,
  UnlockResult,
} from "./types";
import type { RpcClient } from "../rpc";
import { rpcOrThrow } from "../rpc";

type SimState = {
  connection_status: "online" | "offline" | "error" | "unknown";
  last_seen_at: string | null;
  total_slots: number;
  available_batteries: number;
  batteries: { serial: string; slot: number | null; charge_level: number; status: string }[];
};

/**
 * SIMULATOR — clearly identified test hardware.
 * State lives in the database (batteries/machines rows flagged is_simulated),
 * so it works on serverless and survives restarts. Every event it produces is
 * stored with is_simulated = true and shown with a "Simulated" badge.
 */
export class SimulatorProvider implements HardwareProvider {
  readonly id = "simulator";
  readonly displayName = "Simulator (test hardware)";
  readonly isReady = true;

  constructor(private db: RpcClient, private random: () => number = Math.random) {}

  private assertSimulated(device: DeviceRef) {
    if (!device.isSimulated) throw new Error("SimulatorProvider can only drive simulated machines");
  }

  async authenticate() {}

  private async state(device: DeviceRef): Promise<SimState> {
    this.assertSimulated(device);
    return rpcOrThrow<SimState>(this.db, "sim_machine_state", { p_machine: device.machineId });
  }

  async getDeviceStatus(device: DeviceRef): Promise<DeviceStatus> {
    const s = await this.state(device);
    return {
      connection: device.simConfig?.offline ? "offline" : s.connection_status,
      lastSeenAt: s.last_seen_at,
      availableBatteries: s.available_batteries,
      totalSlots: s.total_slots,
      firmware: "sim-1.0",
      signalStrength: 100,
    };
  }

  async getDeviceDetails(device: DeviceRef): Promise<DeviceDetails> {
    const s = await this.state(device);
    return { deviceId: device.deviceId, manufacturer: "Simulator", model: "SIM-8", totalSlots: s.total_slots, firmware: "sim-1.0" };
  }

  async getBatteryInventory(device: DeviceRef): Promise<BatterySlot[]> {
    const s = await this.state(device);
    const slots: BatterySlot[] = [];
    for (let i = 1; i <= s.total_slots; i++) {
      const b = s.batteries.find((x) => x.slot === i && ["in_slot", "charging", "faulty"].includes(x.status));
      slots.push(
        b
          ? { slot: i, serial: b.serial, chargeLevel: b.charge_level, status: b.status as BatterySlot["status"] }
          : { slot: i, serial: null, chargeLevel: null, status: "empty" },
      );
    }
    return slots;
  }

  async unlockBattery(req: UnlockRequest): Promise<UnlockResult> {
    this.assertSimulated(req.device);
    const cfg = req.device.simConfig ?? {};
    if (cfg.offline) return { status: "failed", reason: "device_offline", retryable: false };
    if (cfg.unlock_failure) return { status: "failed", reason: "simulated_unlock_failure", retryable: true };
    if (cfg.failure_rate && this.random() < cfg.failure_rate)
      return { status: "failed", reason: "simulated_random_failure", retryable: true };
    const pick = await rpcOrThrow<{ serial: string; slot: number } | null>(this.db, "sim_pick_battery", {
      p_machine: req.device.machineId,
    });
    if (!pick) return { status: "failed", reason: "no_battery_available", retryable: false };
    if (cfg.unlock_async) return { status: "pending", providerRef: `sim-${req.rentalId}` };
    return { status: "confirmed", batterySerial: pick.serial, slot: pick.slot, providerRef: `sim-${req.idempotencyKey}` };
  }

  async getRentalStatus(providerRef: string, device: DeviceRef): Promise<ProviderRentalStatus> {
    this.assertSimulated(device);
    const pick = await rpcOrThrow<{ serial: string; slot: number } | null>(this.db, "sim_pick_battery", {
      p_machine: device.machineId,
    });
    if (!pick) return { providerRef, state: "failed" };
    return { providerRef, state: "released", batterySerial: pick.serial, slot: pick.slot };
  }

  async getReturnStatus(batterySerial: string, device: DeviceRef): Promise<ReturnStatus> {
    const s = await this.state(device);
    const b = s.batteries.find((x) => x.serial === batterySerial);
    return { batterySerial, returned: !!b && b.status === "in_slot", slot: b?.slot ?? null, machineDeviceId: device.deviceId };
  }

  async getDeviceEvents(): Promise<NormalizedDeviceEvent[]> {
    return []; // simulator pushes events directly into the event pipeline
  }

  async getTransactionDetails(providerRef: string) {
    return { providerRef, simulated: true };
  }

  /** Build a simulated "battery returned" event (fed through the same pipeline as real webhooks). */
  async simulateReturn(device: DeviceRef, batterySerial: string): Promise<NormalizedDeviceEvent> {
    this.assertSimulated(device);
    const slot = await rpcOrThrow<number | null>(this.db, "sim_free_slot", { p_machine: device.machineId });
    if (slot == null) throw new Error("NO_FREE_SLOT");
    return {
      type: "battery_returned",
      deviceId: device.deviceId,
      batterySerial,
      slot,
      chargeLevel: 35 + Math.floor(this.random() * 40),
      occurredAt: new Date().toISOString(),
      externalId: `sim-return-${randomUUID()}`,
    };
  }

  simulateConnection(device: DeviceRef, status: "online" | "offline" | "error"): NormalizedDeviceEvent {
    this.assertSimulated(device);
    return {
      type: "connection_changed",
      deviceId: device.deviceId,
      status,
      occurredAt: new Date().toISOString(),
      externalId: `sim-conn-${randomUUID()}`,
    };
  }
}
