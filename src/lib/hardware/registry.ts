import type { HardwareProvider } from "./types";
import { SimulatorProvider } from "./simulator";
import { HeyChargeProvider } from "./heycharge";
import type { RpcClient } from "../rpc";

export const HARDWARE_PROVIDERS = [
  { id: "simulator", name: "Simulator (test hardware)", manufacturer: "Simulator", simulated: true },
  { id: "heycharge", name: "HeyCharge (Shenzhen EMCC)", manufacturer: "Shenzhen EMCC Technology", simulated: false },
] as const;

export type ProviderId = (typeof HARDWARE_PROVIDERS)[number]["id"];

export function isKnownProvider(id: string): id is ProviderId {
  return HARDWARE_PROVIDERS.some((p) => p.id === id);
}

export function getProvider(id: string, db: RpcClient): HardwareProvider {
  switch (id) {
    case "simulator":
      return new SimulatorProvider(db);
    case "heycharge":
      return new HeyChargeProvider();
    default:
      throw new Error(`Unknown hardware provider: ${id}`);
  }
}
