import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import fenixbotMark from "@/assets/fenixbot-mark.png";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { clearWorkspaceCache } from "@/hooks/use-workspace";
import { acceptInvitation, getInvitation } from "@/lib/team/team.functions";
import { savePendingInvite } from "@/lib/team/pending-invite";

export const Route = createFileRoute("/convite/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Convite — Fenixbot" }, { name: "robots", content: "noindex" }] }),
  component: Convite,
});

type Invitation = Awaited<ReturnType<typeof getInvitation>>;

function Convite() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const fetchInvitation = useServerFn(getInvitation);
  const accept = useServerFn(acceptInvitation);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchInvitation({ data: { token } }).then(setInvitation).catch(() => setInvitation({ status: "invalido" }));
    void supabase.auth.getSession().then(({ data }) => setLoggedIn(Boolean(data.session)));
  }, [token, fetchInvitation]);

  function rememberAndGo(to: "/auth") {
    savePendingInvite(token);
    void navigate({ to });
  }

  async function join() {
    setBusy(true);
    setError("");
    try {
      await accept({ data: { token } });
      clearWorkspaceCache();
      await navigate({ to: "/dashboard" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível aceitar o convite.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-background p-6">
    <section className="w-full max-w-md text-center">
      <img src={fenixbotMark} alt="" width={48} height={48} className="mx-auto size-12 object-contain" />
      {!invitation || loggedIn === null ? <Skeleton className="mx-auto mt-8 h-32 w-full" /> : invitation.status !== "valido" ? <>
        <h1 className="mt-6 text-2xl font-semibold">{invitation.status === "expirado" ? "Este convite expirou" : invitation.status === "usado" ? "Este convite já foi usado" : "Convite inválido"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Peça um novo link ao administrador da empresa.</p>
        <Button asChild variant="outline" className="mt-6"><Link to="/">Ir para o início</Link></Button>
      </> : <>
        <h1 className="mt-6 text-2xl font-semibold">Você foi convidado para {invitation.organizationName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Função: <span className="capitalize">{invitation.role}</span>. Entre com o e-mail convidado ({invitation.emailHint}).</p>
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        {loggedIn
          ? <Button className="mt-6 h-11 w-full" disabled={busy} onClick={() => void join()}>{busy ? "Entrando..." : "Aceitar convite"}</Button>
          : <Button className="mt-6 h-11 w-full" onClick={() => rememberAndGo("/auth")}>Entrar ou criar conta</Button>}
      </>}
    </section>
  </main>;
}
