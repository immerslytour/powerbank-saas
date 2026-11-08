import { publicEnv } from "./env";

/** Public QR/rental URL for a machine: operator's verified domain if any, else the platform. */
export function machineUrl(publicCode: string, primaryDomain?: string | null) {
  const base = primaryDomain ? `https://${primaryDomain}` : publicEnv.appUrl;
  return `${base}/r/${publicCode}`;
}

export function rentalStatusUrl(token: string, primaryDomain?: string | null) {
  const base = primaryDomain ? `https://${primaryDomain}` : publicEnv.appUrl;
  return `${base}/rental/${token}`;
}
