/**
 * Minimal RPC surface used by the rental engine & simulator. Supabase clients
 * satisfy it; tests use a pg-backed implementation against real Postgres.
 */
export type RpcResult<T = unknown> = { data: T | null; error: { message: string; code?: string } | null };

export interface RpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
}

export class RpcError extends Error {
  constructor(public fn: string, message: string, public code?: string) {
    super(message);
    this.name = "RpcError";
  }
}

export async function rpcOrThrow<T>(db: RpcClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new RpcError(fn, error.message, error.code);
  return data as T;
}
