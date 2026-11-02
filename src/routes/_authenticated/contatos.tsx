import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { LoadError } from "@/components/app/load-state";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/_authenticated/contatos")({
  head: () => ({ meta: [{ title: "Contatos — Fenixbot" }, { name: "description", content: "Todos os contatos da sua empresa em um só lugar." }, { property: "og:title", content: "Contatos — Fenixbot" }, { property: "og:description", content: "Lista de contatos com etapa, origem e pontuação." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Contatos,
});

type Contact = { id: string; name: string; phone: string; email: string | null; source: string; stage: string; lead_score: number; tags: string[]; last_interaction_at: string | null; created_at: string };
const stages: Record<string, string> = { novo: "Novo", contato: "Em contato", interessado: "Interessado", qualificado: "Qualificado", proposta: "Proposta", pagamento: "Pagamento", cliente: "Cliente" };

function Contatos() {
  const { workspace } = useWorkspace();
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("todos");
  async function load() {
    if (!workspace) return; setError(""); setRows(null);
    const { data, error } = await supabase.from("contacts").select("id,name,phone,email,source,stage,lead_score,tags,last_interaction_at,created_at").eq("organization_id", workspace.id).order("created_at", { ascending: false });
    if (error) setError("Os contatos não puderam ser carregados."); else setRows(data as Contact[]);
  }
  useEffect(() => { void load(); }, [workspace]);
  const list = useMemo(() => (rows ?? []).filter(c => (stage === "todos" || c.stage === stage) && `${c.name} ${c.phone} ${c.email ?? ""}`.toLowerCase().includes(q.toLowerCase())), [rows, q, stage]);

  return <AppShell title="Contatos" subtitle="Todos os clientes e leads que falaram com a sua empresa.">
    {error ? <LoadError message={error} onRetry={() => void load()} /> : !rows ? <Skeleton className="h-96" /> : <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar por nome, telefone ou e-mail" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select value={stage} onChange={e => setStage(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm" aria-label="Filtrar por etapa">
          <option value="todos">Todas as etapas</option>{Object.entries(stages).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <Card><CardContent className="p-0">
        {list.length ? <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground"><tr><th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">Telefone</th><th className="hidden p-4 font-medium md:table-cell">Origem</th><th className="p-4 font-medium">Etapa</th><th className="hidden p-4 font-medium sm:table-cell">Pontuação</th><th className="hidden p-4 font-medium lg:table-cell">Última interação</th></tr></thead>
          <tbody>{list.map(c => <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
            <td className="p-4"><p className="font-medium">{c.name}</p>{c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}</td>
            <td className="p-4 whitespace-nowrap">{c.phone}</td>
            <td className="hidden p-4 md:table-cell">{c.source}</td>
            <td className="p-4"><span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">{stages[c.stage] ?? c.stage}</span></td>
            <td className="hidden p-4 sm:table-cell">{c.lead_score}/100</td>
            <td className="hidden p-4 text-muted-foreground lg:table-cell">{c.last_interaction_at ? new Date(c.last_interaction_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
          </tr>)}</tbody></table></div>
          : <div className="py-14 text-center"><Users className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{rows.length ? "Nenhum contato encontrado" : "Nenhum contato ainda"}</p><p className="mt-1 text-xs text-muted-foreground">{rows.length ? "Tente outra busca ou etapa." : <>Contatos aparecem quando chegam mensagens ou quando você cria no <Link to="/crm" className="text-primary hover:underline">CRM</Link>.</>}</p></div>}
      </CardContent></Card>
      <p className="mt-3 text-xs text-muted-foreground">{list.length} de {rows.length} contatos</p>
    </>}
  </AppShell>;
}
