/**
 * Hardware provider adapter contract.
 *
 * Every station manufacturer (HeyCharge / Shenzhen EMCC, etc.) is integrated by
 * implementing this interface. The rest of the platform (rental engine,
 * dashboards, webhooks) only talks to this contract, so connecting real
 * hardware means writing one adapter — nothing else changes.
 *
 * IMPORTANT: adapters must only report `confirmed` results when the device /
 * manufacturer cloud actually confirmed them. A sent command is NOT a release.
 */

export type ConnectionStatus = "online" | "offline" | "error" | "unknown";

export type DeviceRef = {
  machineId: string; // our UUID
  tenantId: string;
  deviceId: string; // manufacturer serial / station id
  isSimulated: boolean;
  simConfig?: SimConfig;
};

export type SimConfig = {
  /** Force the next unlock to fail (testing failure handling). */
  unlock_failure?: boolean;
  /** Simulate a slow device: unlock reported as pending, confirmed by a later event. */
  unlock_async?: boolean;
  /** Probability 0..1 of a random unlock failure. */
  failure_rate?: number;
  /** Machine reports offline. */
  offline?: boolean;
};

export type DeviceStatus = {
  connection: ConnectionStatus;
  lastSeenAt: string | null;
  availableBatteries: number;
  totalSlots: number;
  firmware?: string | null;
  signalStrength?: number | null;
  raw?: unknown;
};

export type DeviceDetails = {
  deviceId: string;
  manufacturer: string;
  model: string | null;
  totalSlots: number;
  firmware?: string | null;
  simIccid?: string | null;
  raw?: unknown;
};

export type BatterySlot = {
  slot: number;
  serial: string | null;
  chargeLevel: number | null;
  status: "in_slot" | "charging" | "faulty" | "empty";
};

export type UnlockRequest = {
  device: DeviceRef;
  rentalId: string;
  /** Stable key: retries for the same rental attempt must reuse it. */
  idempotencyKey: string;
  preferredSlot?: number | null;
};

export type UnlockResult =
  | { status: "confirmed"; batterySerial: string; slot: number | null; providerRef: string | null }
  | { status: "pending"; providerRef: string | null } // confirmation will arrive via webhook / polling
  | { status: "failed"; reason: string; retryable: boolean };

export type ProviderRentalStatus = {
  providerRef: string;
  state: "pending" | "released" | "failed" | "returned" | "unknown";
  batterySerial?: string | null;
  slot?: number | null;
  raw?: unknown;
};

export type ReturnStatus = {
  batterySerial: string;
  returned: boolean;
  machineDeviceId?: string | null;
  slot?: number | null;
  returnedAt?: string | null;
  raw?: unknown;
};

/** Normalized event emitted by providers (webhooks, polling) and the simulator. */
export type NormalizedDeviceEvent =
  | {
      type: "battery_released";
      deviceId: string;
      rentalRef: string | null; // our rental id if the provider echoes it, or provider ref
      batterySerial: string;
      slot: number | null;
      occurredAt: string;
      externalId: string;
    }
  | {
      type: "battery_returned";
      deviceId: string;
      batterySerial: string;
      slot: number | null;
      chargeLevel: number | null;
      occurredAt: string;
      externalId: string;
    }
  | {
      type: "unlock_failed";
      deviceId: string;
      rentalRef: string | null;
      reason: string;
      occurredAt: string;
      externalId: string;
    }
  | {
      type: "connection_changed";
      deviceId: string;
      status: ConnectionStatus;
      occurredAt: string;
      externalId: string;
    }
  | {
      type: "device_error";
      deviceId: string;
      code: string;
      message: string;
      occurredAt: string;
      externalId: string;
    };

export type ProviderCredentials = Record<string, string>;

export interface HardwareProvider {
  readonly id: string;
  readonly displayName: string;
  /** True only when the adapter can talk to real hardware right now. */
  readonly isReady: boolean;
  /** Human-readable reason when not ready (missing docs/credentials). */
  readonly notReadyReason?: string;

  authenticate(credentials?: ProviderCredentials): Promise<void>;
  getDeviceStatus(device: DeviceRef): Promise<DeviceStatus>;
  getDeviceDetails(device: DeviceRef): Promise<DeviceDetails>;
  getBatteryInventory(device: DeviceRef): Promise<BatterySlot[]>;
  unlockBattery(req: UnlockRequest): Promise<UnlockResult>;
  getRentalStatus(providerRef: string, device: DeviceRef): Promise<ProviderRentalStatus>;
  getReturnStatus(batterySerial: string, device: DeviceRef): Promise<ReturnStatus>;
  getDeviceEvents(device: DeviceRef, since: Date): Promise<NormalizedDeviceEvent[]>;
  getTransactionDetails(providerRef: string): Promise<unknown>;

  /**
   * Verify and parse an inbound webhook from the manufacturer cloud.
   * Must throw if the signature is invalid.
   */
  parseWebhook?(rawBody: string, headers: Headers, credentials?: ProviderCredentials): Promise<NormalizedDeviceEvent[]>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(public provider: string, message: string) {
    super(message);
    this.name = "ProviderNotConfiguredError";
  }
}
