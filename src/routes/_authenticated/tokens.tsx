import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app/app-shell";
import { LoadError } from "@/components/app/load-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/_authenticated/tokens")({
  head: () => ({ meta: [{ title: "Tokens de IA — Fenixbot" }, { name: "description", content: "Acompanhe o consumo de tokens da Sexta Feira." }, { property: "og:title", content: "Tokens de IA — Fenixbot" }, { property: "og:description", content: "Uso diário, limite do plano e execuções da IA." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Tokens,
});

type Ev = { created_at: string; total_tokens: number | null; status: string; duration_ms: number };
const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(".", ",")}M` : n.toLocaleString("pt-BR");

function Tokens() {
  const { workspace } = useWorkspace();
  const [ev, setEv] = useState<Ev[] | null>(null);
  const [plan, setPlan] = useState<{ name: string; ai_tokens: number } | null>(null);
  const [error, setError] = useState("");
  async function load() {
    if (!workspace) return; setError(""); setEv(null);
    const now = new Date(); const month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [a, b] = await Promise.all([
      supabase.from("ai_usage_events").select("created_at,total_tokens,status,duration_ms").eq("organization_id", workspace.id).gte("created_at", month).order("created_at"),
      supabase.from("subscriptions").select("status,plans(name,ai_tokens)").eq("organization_id", workspace.id).maybeSingle(),
    ]);
    if (a.error || b.error) { setError("O consumo não pôde ser carregado."); return; }
    setPlan(((b.data as any)?.status === "ativa" ? (b.data as any).plans : null) ?? null); setEv(a.data as Ev[]);
  }
  useEffect(() => { void load(); }, [workspace]);

  const now = new Date(); const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const perDay = Array.from({ length: days }, (_, i) => (ev ?? []).filter(e => new Date(e.created_at).getDate() === i + 1).reduce((s, e) => s + (e.total_tokens ?? 0), 0));
  const used = perDay.reduce((a, b) => a + b, 0); const max = Math.max(1, ...perDay);
  const ok = (ev ?? []).filter(e => e.status === "sucesso" || e.status === "success" || e.status === "concluido").length;
  const avg = ev?.length ? Math.round(ev.reduce((s, e) => s + e.duration_ms, 0) / ev.length) : 0;
  const pct = plan ? Math.min(100, used / plan.ai_tokens * 100) : 0;

  return <AppShell title="Tokens de IA" subtitle="Quanto a Sexta Feira consumiu neste mês.">
    {error ? <LoadError message={error} onRetry={() => void load()} /> : !ev ? <Skeleton className="h-96" /> : <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Usados no mês" value={fmt(used)} />
        <Stat label="Limite do plano" value={plan ? fmt(plan.ai_tokens) : "Sem plano"} hint={plan ? plan.name : undefined} />
        <Stat label="Execuções" value={String(ev.length)} hint={`${ev.length - ok} com erro`} />
        <Stat label="Tempo médio" value={`${(avg / 1000).toFixed(1).replace(".", ",")} s`} />
      </div>
      <Card><CardContent className="p-5">
        {plan ? <><div className="flex justify-between text-sm"><span>{pct.toFixed(0)}% do limite</span><span className="text-muted-foreground">{fmt(Math.max(0, plan.ai_tokens - used))} restantes</span></div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>
          {pct > 80 && <p className="mt-2 text-xs text-warning">Você está perto do limite do plano.</p>}</>
          : <p className="text-sm text-muted-foreground">Nenhum plano ativo, então não há limite para comparar. <Link to="/planos" className="text-primary hover:underline">Ver planos</Link></p>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Consumo por dia</CardTitle></CardHeader><CardContent>
        {used ? <div className="flex h-48 items-end gap-1">{perDay.map((v, i) => <div key={i} className="group relative flex-1"><div className="rounded-t bg-gradient-to-t from-primary/60 to-primary transition-opacity group-hover:opacity-80" style={{ height: `${(v / max) * 176}px`, minHeight: v ? 3 : 0 }} /><span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-[11px] group-hover:block">Dia {i + 1}: {fmt(v)}</span></div>)}</div>
          : <p className="py-10 text-center text-sm text-muted-foreground">Ainda não houve uso da IA neste mês.</p>}
      </CardContent></Card>
    </div>}
  </AppShell>;
}
function Stat({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-3 text-2xl font-semibold">{value}</p>{hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}</CardContent></Card>;
}
