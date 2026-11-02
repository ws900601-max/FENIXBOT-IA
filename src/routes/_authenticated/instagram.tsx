import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Instagram } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { LoadError } from "@/components/app/load-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";
import { disconnectInstagram, getInstagramSetup, startInstagramConnect, testInstagramConnection } from "@/lib/instagram/instagram.functions";

export const Route = createFileRoute("/_authenticated/instagram")({
  head: () => ({ meta: [{ title: "Instagram — Fenixbot" }, { name: "description", content: "Conecte o Direct do Instagram ao Fenixbot." }, { property: "og:title", content: "Instagram — Fenixbot" }, { property: "og:description", content: "Atenda mensagens do Instagram na caixa de entrada." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: InstagramPage,
});

type Setup = Awaited<ReturnType<typeof getInstagramSetup>>;

function InstagramPage() {
  const { workspace } = useWorkspace();
  const getSetup = useServerFn(getInstagramSetup), start = useServerFn(startInstagramConnect), test = useServerFn(testInstagramConnection), disconnect = useServerFn(disconnectInstagram);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canManage = workspace?.role === "administrador" || workspace?.role === "gerente";

  const load = useCallback(async () => {
    if (!workspace) return;
    setError("");
    try { setSetup(await getSetup({ data: { organizationId: workspace.id } })); } catch { setError("Não foi possível carregar o Instagram."); }
  }, [workspace, getSetup]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("status") === "ok") toast.success("Instagram conectado.");
    if (p.get("status") === "erro") toast.error(p.get("message") || "Não foi possível conectar.");
    if (p.get("status")) window.history.replaceState({}, "", "/instagram");
  }, []);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    if (busy) return; setBusy(true);
    try { await fn(); if (ok) toast.success(ok); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Algo deu errado."); } finally { setBusy(false); }
  }

  const acc = setup?.account;
  const label = !acc ? "Desconectado" : acc.status === "conectado" ? "Conectado" : "Precisa de atenção";
  const color = acc?.status === "conectado" ? "text-success" : acc ? "text-warning" : "text-muted-foreground";

  return <AppShell title="Instagram" subtitle="Receba e responda mensagens do Direct na caixa de entrada.">
    {error ? <LoadError message={error} onRetry={() => void load()} /> : !setup ? <Skeleton className="h-64 w-full" /> : <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <Card><CardContent className="p-6">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-lg bg-accent"><Instagram className="size-5 text-primary" /></span><div className="flex-1"><p className="font-medium">{acc?.username ? `@${acc.username}` : "Instagram Direct"}</p><p className="text-xs text-muted-foreground">API oficial da Meta</p></div><span className={`inline-flex items-center gap-1.5 text-xs ${color}`}><span className="size-2 rounded-full bg-current" />{label}</span></div>
        {acc?.last_error && <p className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">{acc.last_error}</p>}
        {acc?.last_sync_at && <p className="mt-4 text-xs text-muted-foreground">Última atividade: {new Date(acc.last_sync_at).toLocaleString("pt-BR")}</p>}
        {!setup.credentialsConfigured && <p className="mt-4 rounded-md border bg-muted/40 p-3 text-sm">Configuração necessária: as credenciais do app da Meta ainda não foram adicionadas ao Fenixbot.</p>}
        <div className="mt-6 flex flex-wrap gap-2">
          {!canManage ? <p className="text-sm text-muted-foreground">Somente administradores e gerentes podem configurar.</p> : <>
            <Button disabled={busy || !setup.credentialsConfigured} onClick={() => void run(async () => { const r = await start({ data: { organizationId: workspace!.id, origin: window.location.origin } }); window.location.href = r.url; })}>{acc ? "Reconectar" : "Conectar Instagram"}</Button>
            {acc && <Button variant="outline" disabled={busy} onClick={() => void run(() => test({ data: { organizationId: workspace!.id } }), "Conexão funcionando.")}>Testar conexão</Button>}
            {acc && <Button variant="outline" disabled={busy} onClick={() => { if (confirm("Desconectar o Instagram?")) void run(() => disconnect({ data: { organizationId: workspace!.id } }), "Instagram desconectado."); }}>Desconectar</Button>}
          </>}
        </div>
      </CardContent></Card>
      <Card><CardContent className="space-y-3 p-6 text-sm">
        <p className="font-medium">Antes de conectar</p>
        <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
          <li>Sua conta do Instagram precisa ser Profissional (Empresa ou Criador).</li>
          <li>No app aberto no Instagram, ative “Permitir acesso às mensagens” em Configurações › Mensagens.</li>
          <li>No painel da Meta, em Webhooks do Instagram, use o endereço <code className="break-all text-foreground">{typeof window !== "undefined" ? window.location.origin : ""}/api/public/instagram/webhook</code> e assine “messages”.</li>
          <li>Clique em Conectar Instagram e autorize o acesso.</li>
        </ol>
      </CardContent></Card>
    </div>}
  </AppShell>;
}
