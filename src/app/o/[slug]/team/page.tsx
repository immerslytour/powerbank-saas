import { requireTenant, ROLE_RANK, type Role } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { PageHeader, Alert } from "@/components/ui/misc";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { InviteDialog, RevokeInviteButton, MemberControls } from "@/components/team/team-ui";

export default async function TeamPage(props: PageProps<"/o/[slug]/team">) {
  const { slug } = await props.params;
  const ctx = await requireTenant(slug, "manager");
  const { t, locale } = await getI18n();
  const [{ data: members }, { data: invites }] = await Promise.all([
    ctx.supabase.from("memberships").select("id, role, status, created_at, user_id, profiles(email, full_name)").eq("tenant_id", ctx.tenant.id).order("created_at"),
    ctx.supabase.from("invitations").select("id, email, role, expires_at, created_at").eq("tenant_id", ctx.tenant.id).is("accepted_at", null).is("revoked_at", null).order("created_at", { ascending: false }),
  ]);
  const isOwner = ctx.rank >= ROLE_RANK.owner;
  const allowedRoles = (["owner", "manager", "employee"] as Role[]).filter((r) => ROLE_RANK[r] <= ctx.rank);
  const teamOk = !!ctx.features.team_access || ctx.role === "super_admin";
  return (
    <>
      <PageHeader title={t.team.title} subtitle={`${t.team.subtitle}${ctx.plan?.team_limit ? ` · ${(members ?? []).length}/${ctx.plan.team_limit}` : ""}`} actions={<InviteDialog t={t} tenantId={ctx.tenant.id} roles={allowedRoles} />} />
      {!teamOk && <Alert tone="info" className="mb-4">{t.team.teamLocked}</Alert>}
      <Card>
        <Table>
          <THead><tr><TH>{t.common.name}</TH><TH>{t.team.role}</TH><TH>{t.common.status}</TH><TH>{t.common.created}</TH><TH /></tr></THead>
          <tbody>
            {(members ?? []).map((m) => (
              <TR key={m.id}>
                <TD>
                  <div className="font-medium">{m.profiles?.full_name ?? m.profiles?.email} {m.user_id === ctx.user.id && <Badge tone="blue">{t.team.you}</Badge>}</div>
                  <div className="text-xs text-muted">{m.profiles?.email}</div>
                </TD>
                <TD>{(t.roles as Record<string, string>)[m.role]}</TD>
                <TD><StatusBadge status={m.status === "active" ? "active" : "suspended"} t={t} /></TD>
                <TD className="text-muted">{formatDate(m.created_at, locale)}</TD>
                <TD>{isOwner && m.user_id !== ctx.user.id && <MemberControls t={t} tenantId={ctx.tenant.id} membershipId={m.id} role={m.role} status={m.status} />}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
      {(invites ?? []).length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle>{t.team.pendingInvites}</CardTitle></CardHeader>
          <Table>
            <THead><tr><TH>{t.common.email}</TH><TH>{t.team.role}</TH><TH>{t.common.created}</TH><TH /></tr></THead>
            <tbody>
              {(invites ?? []).map((i) => (
                <TR key={i.id}>
                  <TD>{i.email}</TD>
                  <TD>{(t.roles as Record<string, string>)[i.role]}</TD>
                  <TD className="text-muted">{formatDate(i.created_at, locale)}</TD>
                  <TD className="text-right"><RevokeInviteButton t={t} tenantId={ctx.tenant.id} invitationId={i.id} /></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
