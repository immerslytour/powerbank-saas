"use client";
import { useState } from "react";
import { RotateCcw, XCircle, Undo2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { cancelRentalAction, retryUnlockAction, refundAction } from "@/lib/actions/rentals";
import { centsToInput } from "@/lib/utils";
import type { Dict } from "@/lib/i18n/format";

export function CancelRentalButton({ t, tenantId, rentalId }: { t: Dict; tenantId: string; rentalId: string }) {
  return (
    <Dialog title={t.rentals.cancel} description={t.rentals.cancelHint} trigger={<Button variant="danger-outline" size="sm"><XCircle />{t.rentals.cancel}</Button>}>
      <ActionForm action={cancelRentalAction}>
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="rentalId" value={rentalId} />
        <div className="flex justify-end"><SubmitButton variant="danger">{t.common.confirm}</SubmitButton></div>
      </ActionForm>
    </Dialog>
  );
}

export function RetryUnlockButton({ t, tenantId, rentalId }: { t: Dict; tenantId: string; rentalId: string }) {
  return (
    <ActionForm action={retryUnlockAction}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="rentalId" value={rentalId} />
      <SubmitButton size="sm" variant="secondary"><RotateCcw />{t.rentals.retryUnlock}</SubmitButton>
    </ActionForm>
  );
}

export function RefundDialog({ t, tenantId, paymentId, refundable }: { t: Dict; tenantId: string; paymentId: string; refundable: number }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) setKey(crypto.randomUUID()); setOpen(o); }} title={t.rentals.issueRefund} trigger={<Button size="sm" variant="secondary"><Undo2 />{t.rentals.issueRefund}</Button>}>
      <ActionForm action={refundAction} className="space-y-4" onSuccess={() => setTimeout(() => setOpen(false), 600)}>
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="paymentId" value={paymentId} />
        <input type="hidden" name="idempotencyKey" value={key} />
        <Field label={t.rentals.refundAmount} htmlFor="amount" hint={`max ${centsToInput(refundable)}`}>
          <Input id="amount" name="amount" inputMode="decimal" defaultValue={centsToInput(refundable)} required />
        </Field>
        <Field label={t.rentals.refundReason} htmlFor="reason"><Input id="reason" name="reason" maxLength={500} /></Field>
        <div className="flex justify-end"><SubmitButton>{t.rentals.issueRefund}</SubmitButton></div>
      </ActionForm>
    </Dialog>
  );
}
