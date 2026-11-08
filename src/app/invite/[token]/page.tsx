import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { publicEnv } from "@/lib/env";
import { acceptInvite } from "@/lib/actions/onboarding";
import { Logo } from "@/components/shell/logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/form";

export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const user = await getSessionUser();
  const { t } = await getI18n();
  const next = `/invite/${encodeURIComponent(token)}`;
  return (
    <div className="min-h-dvh bg-canvas bg-grid-light">
      <div className="mx-auto max-w-md px-5 py-16">
        <Logo name={publicEnv.platformName} />
        <Card className="mt-8">
          <CardContent className="p-6">
            <h1 className="text-xl font-semibold tracking-tight">{t.invite.title}</h1>
            {user ? (
              <>
                <p className="mt-2 text-sm text-muted">{user.email}</p>
                <ActionForm action={acceptInvite} className="mt-6">
                  <input type="hidden" name="token" value={token} />
                  <SubmitButton className="w-full" size="lg">{t.invite.accept}</SubmitButton>
                </ActionForm>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted">{t.invite.signInFirst}</p>
                <div className="mt-6 grid gap-2">
                  <Button asChild size="lg"><Link href={`/signup?next=${encodeURIComponent(next)}`}>{t.auth.signUp}</Link></Button>
                  <Button asChild size="lg" variant="secondary"><Link href={`/login?next=${encodeURIComponent(next)}`}>{t.auth.signIn}</Link></Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
