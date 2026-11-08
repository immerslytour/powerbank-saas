"use client";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, Select } from "@/components/ui/input";
import { CopyButton } from "@/components/ui/copy-button";
import { inviteMember, revokeInvitation, updateMember } from "@/lib/actions/team";
import type { Dict } from "@/lib/i18n/format";

export function InviteDialog({ t, tenantId, roles }: { t: Dict; tenantId: string; roles: ("owner" | "manager" | "employee")[] }) {
  const [link, setLink] = useState<string | null>(null);
  return (
    <Dialog title={t.team.invite} trigger={<Button><UserPlus />{t.team.invite}</Button>} onOpenChange={(o) => !o && setLink(null)}>
      <ActionForm action={inviteMember} className="space-y-4" onSuccess={(s) => setLink((s?.ok && (s.data?.link as string)) || null)}>
        <input type="hidden" name="tenantId" value={tenantId} />
        <Field label={t.common.email} htmlFor="email"><Input id="email" name="email" type="email" required /></Field>
        <Field label={t.team.role} htmlFor="role">
          <Select id="role" name="role" defaultValue="employee">
            {roles.map((r) => <option key={r} value={r}>{t.roles[r]} — {t.team.roleHelp[r]}</option>)}
          </Select>
        </Field>
        <div className="flex justify-end"><SubmitButton>{t.team.invite}</SubmitButton></div>
        {link && (
          <div className="rounded-lg border border-line bg-canvas p-3">
            <div className="mb-2 text-xs font-medium text-muted">{t.team.inviteLink}</div>
            <div className="mb-2 break-all font-mono text-xs">{link}</div>
            <CopyButton value={link} label={t.common.copy} copiedLabel={t.common.copied} />
          </div>
        )}
      </ActionForm>
    </Dialog>
  );
}

export function RevokeInviteButton({ t, tenantId, invitationId }: { t: Dict; tenantId: string; invitationId: string }) {
  return (
    <ActionForm action={revokeInvitation} showSuccess={false}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <SubmitButton size="sm" variant="ghost">{t.team.revoke}</SubmitButton>
    </ActionForm>
  );
}

export function MemberControls({ t, tenantId, membershipId, role, status }: { t: Dict; tenantId: string; membershipId: string; role: string; status: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <ActionForm action={updateMember} showSuccess={false} className="flex items-center gap-2">
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="membershipId" value={membershipId} />
        <input type="hidden" name="op" value="role" />
        <Select name="role" defaultValue={role} className="h-8 w-36 text-xs">
          {(["owner", "manager", "employee"] as const).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
        </Select>
        <SubmitButton size="sm" variant="secondary">{t.common.save}</SubmitButton>
      </ActionForm>
      <ActionForm action={updateMember} showSuccess={false}>
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="membershipId" value={membershipId} />
        <input type="hidden" name="op" value={status === "active" ? "disable" : "enable"} />
        <SubmitButton size="sm" variant="ghost">{status === "active" ? t.team.disable : t.team.enable}</SubmitButton>
      </ActionForm>
      <ActionForm action={updateMember} showSuccess={false}>
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="membershipId" value={membershipId} />
        <input type="hidden" name="op" value="remove" />
        <SubmitButton size="sm" variant="danger-outline">{t.team.remove}</SubmitButton>
      </ActionForm>
    </div>
  );
}
