import { publicEnv } from "./env";

export function brandAssetUrl(path: string | null | undefined) {
  if (!path) return null;
  return `${publicEnv.supabaseUrl}/storage/v1/object/public/brand-assets/${path.split("/").map(encodeURIComponent).join("/")}`;
}
