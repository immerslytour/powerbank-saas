import { Client } from "pg";
import type { RpcClient, RpcResult } from "@/lib/rpc";

/** Supabase-compatible `rpc()` backed by a direct Postgres connection (tests only). */
export function pgRpc(client: Client): RpcClient & { client: Client } {
  const retsetCache = new Map<string, boolean>();
  return {
    client,
    async rpc(fn: string, args: Record<string, unknown> = {}): Promise<RpcResult> {
      try {
        if (!retsetCache.has(fn)) {
          const r = await client.query("select bool_or(proretset) rs from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace", [fn]);
          retsetCache.set(fn, !!r.rows[0]?.rs);
        }
        const keys = Object.keys(args);
        const params = keys.map((k) => {
          const v = args[k];
          return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
        });
        const named = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
        const res = await client.query(`select * from public.${fn}(${named})`, params);
        const col = res.fields[0]?.name;
        if (retsetCache.get(fn)) return { data: res.rows.map((r) => r[col]), error: null };
        const value = res.rows[0]?.[col];
        return { data: value === undefined ? null : value, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message, code: (e as { code?: string }).code } };
      }
    },
  };
}
