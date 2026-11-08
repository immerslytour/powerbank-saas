import type { HardwareProvider } from "./types";
import { ProviderNotConfiguredError } from "./types";

/**
 * HeyCharge / Shenzhen EMCC Technology adapter — NOT YET CONNECTED.
 *
 * The stations ordered from Shenzhen EMCC ship with HeyCharge's own cloud
 * ("admin system") and a SIM card for connectivity. Their device API has not
 * been provided yet, so this adapter deliberately does NOT invent endpoints.
 *
 * To activate (see docs/HARDWARE_INTEGRATION.md):
 *   1. Obtain from the supplier: API base URL, auth method + credentials,
 *      unlock/eject command, device status + inventory endpoints, and the
 *      webhook/callback format + signature scheme for release/return events.
 *   2. Implement each method below against that documentation.
 *   3. Set `isReady = true` once authenticate() succeeds against a real station.
 * Machines registered with provider "heycharge" will refuse rentals until then.
 */
const REASON =
  "HeyCharge API documentation and credentials have not been provided yet. " +
  "Rentals on these machines are disabled until the adapter is implemented (docs/HARDWARE_INTEGRATION.md).";

function notConfigured(): never {
  throw new ProviderNotConfiguredError("heycharge", REASON);
}

export class HeyChargeProvider implements HardwareProvider {
  readonly id = "heycharge";
  readonly displayName = "HeyCharge (Shenzhen EMCC)";
  readonly isReady = false;
  readonly notReadyReason = REASON;

  async authenticate(): Promise<void> {
    notConfigured();
  }
  async getDeviceStatus(): Promise<never> {
    notConfigured();
  }
  async getDeviceDetails(): Promise<never> {
    notConfigured();
  }
  async getBatteryInventory(): Promise<never> {
    notConfigured();
  }
  async unlockBattery(): Promise<never> {
    notConfigured();
  }
  async getRentalStatus(): Promise<never> {
    notConfigured();
  }
  async getReturnStatus(): Promise<never> {
    notConfigured();
  }
  async getDeviceEvents(): Promise<never> {
    notConfigured();
  }
  async getTransactionDetails(): Promise<never> {
    notConfigured();
  }
  async parseWebhook(): Promise<never> {
    notConfigured();
  }
}
