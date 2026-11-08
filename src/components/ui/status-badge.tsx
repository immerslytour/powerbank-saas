import { Badge } from "./badge";
import type { Dict } from "@/lib/i18n/format";

type Tone = "neutral" | "blue" | "green" | "amber" | "red" | "navy";
const TONES: Record<string, Tone> = {
  active: "blue",
  online: "green",
  returned: "green",
  succeeded: "green",
  processed: "green",
  trialing: "blue",
  authorized: "blue",
  pending: "amber",
  requires_payment: "amber",
  onboarding_incomplete: "amber",
  restricted: "amber",
  past_due: "amber",
  maintenance: "amber",
  partially_refunded: "amber",
  partial: "amber",
  open: "amber",
  overdue: "red",
  failed: "red",
  offline: "red",
  error: "red",
  suspended: "red",
  unpaid: "red",
  disconnected: "red",
  cancelled: "neutral",
  canceled: "neutral",
  refunded: "neutral",
  retired: "neutral",
  unknown: "neutral",
  not_connected: "neutral",
  none: "neutral",
  closed: "neutral",
  ignored: "neutral",
  received: "neutral",
  full: "neutral",
  incomplete: "amber",
  incomplete_expired: "red",
  paused: "neutral",
  processing: "blue",
};

export function StatusBadge({ status, t }: { status: string; t: Dict }) {
  const label = (t.status as Record<string, string>)[status] ?? status;
  return (
    <Badge tone={TONES[status] ?? "neutral"} dot>
      {label}
    </Badge>
  );
}

export function SimBadge({ t }: { t: Dict }) {
  return <Badge tone="sim">{t.common.simulated}</Badge>;
}
