import { requireSuperAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { UserBlockButton } from "@/components/admin/admin-forms";

export default async function AdminUsers(props: PageProps<"/admin/users">) {
  const me = await requireSuperAdmin();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase().slice(0, 60) : "";
  const { t, locale } = await getI18n();
  const admin = createAdminClient();
  const [{ data: profiles }, { data: members }, authList] = await Promise.all([
    admin.from("profiles").select("id, email, full_name, is_super_admin, created_at").order("created_at", { ascending: false }).limit(500),
    admin.from("memberships").select("user_id, role, tenants(name)"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const authById = new Map((authList.data?.users ?? []).map((u) => [u.id, u]));
  const bizByUser = new Map<string, string[]>();
  for (const m of members ?? []) {
    const name = (m.tenants as unknown as { name: string } | null)?.name;
    if (!name) continue;
    bizByUser.set(m.user_id, [...(bizByUser.get(m.user_id) ?? []), name]);
  }
  const rows = (profiles ?? []).filter((p) => !q || (p.email ?? "").toLowerCase().includes(q) || (p.full_name ?? "").toLowerCase().includes(q));
  return (
    <>
      <PageHeader title={t.admin.usersTitle} />
      <form className="mb-4 max-w-sm"><Input name="q" defaultValue={q} placeholder={t.common.search} /></form>
      <Card>
        <Table>
          <THead><tr><TH>{t.common.name}</TH><TH>{t.admin.businesses}</TH><TH>{t.admin.lastSignIn}</TH><TH>{t.common.status}</TH><TH></TH></tr></THead>
          <tbody>
            {rows.map((p) => {
              const u = authById.get(p.id);
              const blocked = !!u?.banned_until && new Date(u.banned_until) > new Date();
              const protectedUser = p.is_super_admin || p.id === me.id;
              return (
                <TR key={p.id}>
                  <TD><div className="font-medium">{p.full_name ?? p.email}</div><div className="text-xs text-muted">{p.email}</div></TD>
                  <TD className="text-sm">{(bizByUser.get(p.id) ?? []).join(", ") || "—"}</TD>
                  <TD className="text-muted">{u?.last_sign_in_at ? formatDate(u.last_sign_in_at, locale) : t.admin.never}</TD>
                  <TD>{blocked ? <Badge tone="red" dot>{t.admin.blocked}</Badge> : p.is_super_admin ? <Badge tone="blue">{t.roles.super_admin}</Badge> : <Badge tone="green" dot>{t.status.active}</Badge>}</TD>
                  <TD className="text-right">{protectedUser ? null : <UserBlockButton t={t} userId={p.id} blocked={blocked} />}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
