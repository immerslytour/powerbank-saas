"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { getI18n } from "../i18n";
import { rateLimit } from "../rate-limit";
import { getEngineDeps, getPlatformSetting } from "../rentals/deps";
import { startRental, onPaymentAuthorized } from "../rentals/engine";
import { createRentalCheckout } from "../stripe/rental-checkout";
import { isStripeConfigured, serverEnv, publicEnv } from "../env";
import { loadPublicMachine } from "../public-rental";
import { dbErrorCode, errorMessage } from "../utils";
import type { ActionState } from "../action-result";

const schema = z.object({
  code: z.string().regex(/^[A-Za-z0-9]{4,16}$/),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  accept: z.literal("on"),
  method: z.enum(["stripe", "simulated"]),
});

async function originFor(): Promise<string> {
  const h = await headers();
  const tenantHost = h.get("x-tenant-host");
  return tenantHost ? `https://${tenantHost}` : publicEnv.appUrl;
}

/** Customer starts a rental from the QR page. All validation and pricing happen server-side. */
export async function startRentalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t, locale } = await getI18n();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: t.errors.VALIDATION };
  const v = parsed.data;
  if (!(await rateLimit("rent", 8, 600))) return { ok: false, error: t.errors.RATE_LIMITED };
  const info = await loadPublicMachine(v.code);
  if (!info) return { ok: false, error: t.errors.MACHINE_NOT_FOUND };

  if (v.method === "simulated") {
    const payments = await getPlatformSetting<{ allow_simulated_payments?: boolean }>("payments");
    if (!info.machine.is_simulated || !serverEnv().allowSimulatedPayments || payments?.allow_simulated_payments === false) {
      return { ok: false, error: t.errors.SIMULATED_PAYMENT_NOT_ALLOWED };
    }
  } else if (!isStripeConfigured()) {
    return { ok: false, error: t.errors.PAYMENTS_NOT_ENABLED };
  }

  const origin = await originFor();
  let target: string;
  try {
    const deps = await getEngineDeps();
    const r = await startRental(deps, { machineCode: v.code, locale, email: v.email || null, paymentProvider: v.method });
    if (v.method === "simulated") {
      await onPaymentAuthorized(deps, {
        rentalId: r.rental_id,
        provider: "simulated",
        paymentIntentId: null,
        amount: r.amount_to_authorize,
        currency: r.currency,
        livemode: false,
        email: v.email || null,
      });
      target = `${origin}/rental/${r.public_token}`;
    } else {
      target = await createRentalCheckout({
        rentalId: r.rental_id,
        tenantId: r.tenant_id,
        account: r.stripe_account_id!,
        amount: r.amount_to_authorize,
        currency: r.currency,
        operatorName: info.brand.display_name,
        machineCode: info.machine.code,
        locale,
        email: v.email || null,
        successUrl: `${origin}/rental/${r.public_token}?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/r/${info.machine.code}?cancelled=1`,
      });
    }
  } catch (e) {
    const code = dbErrorCode(e);
    console.error("[rent]", errorMessage(e));
    return { ok: false, error: (code && (t.errors as Record<string, string>)[code]) || t.customer.errorGeneric };
  }
  redirect(target);
}
