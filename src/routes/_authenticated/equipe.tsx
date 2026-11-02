import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Trash2, UserPlus, X } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { LoadError } from "@/components/app/load-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";
import { changeMemberRole, createInvitation, listTeam, removeMember, revokeInvitation } from "@/lib/team/team.functions";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({ meta: [{ title: "Equipe — Fenixbot" }, { name: "description", content: "Membros da equipe e suas permissões." }, { property: "og:title", content: "Equipe — Fenixbot" }, { property: "og:description", content: "Gerencie funções de administradores, gerentes e atendentes." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Equipe,
});

type Role = "administrador" | "gerente" | "atendente";
type Team = Awaited<ReturnType<typeof listTeam>>;
const roleInfo: Record<Role, string> = { administrador: "Acesso total, inclusive equipe e cobrança", gerente: "Configura IA, canais e produtos", atendente: "Atende conversas e usa o CRM" };

function inviteLink(token: string) {
  return `${window.location.origin}/convite/${token}`;
}

async function copyLink(token: string) {
  try {
    await navigator.clipboard.writeText(inviteLink(token));
    toast.success("Link copiado. Envie para a pessoa por WhatsApp ou e-mail.");
  } catch {
    toast.error("Não foi possível copiar. Copie o link manualmente.");
  }
}

function Equipe() {
  const { workspace } = useWorkspace();
  const fetchTeam = useServerFn(listTeam);
  const invite = useServerFn(createInvitation);
  const revoke = useServerFn(revokeInvitation);
  const changeRole = useServerFn(changeMemberRole);
  const remove = useServerFn(removeMember);
  const [team, setTeam] = useState<Team | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("atendente");
  const isAdmin = workspace?.role === "administrador";

  const load = useCallback(async () => {
    if (!workspace) return;
    setError("");
    try { setTeam(await fetchTeam({ data: { organizationId: workspace.id } })); } catch { setError("A equipe não pôde ser carregada."); }
  }, [workspace, fetchTeam]);
  useEffect(() => { void load(); }, [load]);

  async function run(key: string, action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(key);
    try { await action(); toast.success(success); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível concluir."); } finally { setBusy(""); }
  }

  async function sendInvite() {
    if (!workspace || busy) return;
    setBusy("invite");
    try {
      const { token } = await invite({ data: { organizationId: workspace.id, email, role } });
      setEmail("");
      await copyLink(token);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o convite.");
    } finally {
      setBusy("");
    }
  }

  return <AppShell title="Equipe" subtitle="Quem tem acesso ao Fenixbot da sua empresa.">
    {error ? <LoadError message={error} onRetry={() => void load()} /> : !team || !workspace ? <Skeleton className="h-64" /> : <div className="space-y-6">
      {isAdmin && <Card><CardContent className="p-5">
        <p className="flex items-center gap-2 text-sm font-medium"><UserPlus className="size-4 text-primary" />Convidar pessoa</p>
        <p className="mt-1 text-xs text-muted-foreground">Gere um link de convite válido por 7 dias e envie para a pessoa. Ela entra com o mesmo e-mail convidado.</p>
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void sendInvite(); }}>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@empresa.com" className="sm:flex-1" aria-label="E-mail" />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-10 rounded-md border bg-background px-3 text-sm capitalize" aria-label="Função">
            {(Object.keys(roleInfo) as Role[]).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <Button type="submit" disabled={busy === "invite" || !email.trim()}>{busy === "invite" ? "Gerando..." : "Gerar convite"}</Button>
        </form>
      </CardContent></Card>}

      <Card><CardContent className="p-0">{team.members.map((m) => <div key={m.id} className="flex flex-wrap items-center gap-3 border-b p-4 last:border-0">
        <span className="grid size-9 place-items-center rounded-full bg-accent text-xs font-semibold uppercase text-accent-foreground">{(m.name || m.email || "?").slice(0, 2)}</span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{m.name || m.email || "Membro"}{m.user_id === team.me && <span className="text-muted-foreground"> (você)</span>}</p><p className="truncate text-xs text-muted-foreground">{m.email} · {roleInfo[m.role]}</p></div>
        {isAdmin && m.user_id !== team.me ? <div className="flex items-center gap-2">
          <select disabled={busy === m.id} value={m.role} onChange={(e) => void run(m.id, () => changeRole({ data: { organizationId: workspace.id, memberId: m.id, role: e.target.value as Role } }), "Função atualizada.")} className="h-9 rounded-md border bg-background px-3 text-sm capitalize" aria-label="Função">
            {(Object.keys(roleInfo) as Role[]).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <Button size="icon" variant="ghost" aria-label="Remover da equipe" disabled={busy === m.id} onClick={() => { if (confirm("Remover esta pessoa da equipe?")) void run(m.id, () => remove({ data: { organizationId: workspace.id, memberId: m.id } }), "Pessoa removida da equipe."); }}><Trash2 /></Button>
        </div> : <span className="rounded-full bg-accent px-3 py-1 text-xs capitalize text-accent-foreground">{m.role}</span>}
      </div>)}</CardContent></Card>

      {isAdmin && <div>
        <h2 className="mb-2 text-sm font-medium">Convites pendentes</h2>
        {!team.invitations.length ? <p className="text-sm text-muted-foreground">Nenhum convite pendente.</p> : <Card><CardContent className="p-0">{team.invitations.map((i) => {
          const expired = new Date(i.expires_at).getTime() < Date.now();
          return <div key={i.id} className="flex flex-wrap items-center gap-3 border-b p-4 last:border-0">
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{i.email}</p><p className="text-xs capitalize text-muted-foreground">{i.role} · {expired ? "expirado" : `expira em ${new Date(i.expires_at).toLocaleDateString("pt-BR")}`}</p></div>
            {!expired && <Button size="sm" variant="outline" onClick={() => void copyLink(i.token)}><Copy />Copiar link</Button>}
            <Button size="sm" variant="ghost" disabled={busy === i.id} onClick={() => void run(i.id, () => revoke({ data: { organizationId: workspace.id, invitationId: i.id } }), "Convite cancelado.")}><X />Cancelar</Button>
          </div>;
        })}</CardContent></Card>}
      </div>}
    </div>}
  </AppShell>;
}
