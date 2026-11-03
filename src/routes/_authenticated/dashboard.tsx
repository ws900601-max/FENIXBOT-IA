import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Clock3, Cpu, MessageCircle, Target, Users } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/app/load-state";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { useServerFn } from "@tanstack/react-start";
import { getPlanStatus } from "@/lib/billing/billing.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Central de comando — Fenixbot" }, { name: "description", content: "Mensagens, contatos, tokens de IA e conversões da sua operação." }, { property: "og:title", content: "Central de comando — Fenixbot" }, { property: "og:description", content: "Painel operacional da sua empresa no Fenixbot." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Dashboard,
});

type Conversation = { id: string; last_message: string | null; last_message_at: string; contacts: { name: string } | null };
type Data = { today: number; month: number; prevMonth: number; incoming: number; outgoing: number; contacts: { stage: string; created_at: string }[]; tokens: number; allowance: number | null; planName: string | null; aiOn: boolean; recent: Conversation[] };

const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1).replace(".", ",")}k` : n.toLocaleString("pt-BR");
const greet = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };

function Dashboard() {
  const { workspace } = useWorkspace();
  const [data, setData] = useState<Data | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const loadPlan = useServerFn(getPlanStatus);

  async function load() {
    if (!workspace) return;
    setError(""); setData(null);
    const org = workspace.id; const now = new Date();
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const count = (q: any) => q.then((r: any) => { if (r.error) throw r.error; return r.count ?? 0; });
    const m = () => supabase.from("messages").select("id", { count: "exact", head: true }).eq("organization_id", org);
    try {
      const [today, monthC, prevC, incoming, contacts, usage, sub, ai, recent, user] = await Promise.all([
        count(m().gte("sent_at", day)), count(m().gte("sent_at", month)), count(m().gte("sent_at", prev).lt("sent_at", month)),
        count(m().gte("sent_at", month).eq("sender", "cliente")),
        supabase.from("contacts").select("stage,created_at").eq("organization_id", org),
        supabase.from("ai_usage_events").select("total_tokens").eq("organization_id", org).gte("created_at", month),
        loadPlan({ data: { organizationId: org } }).then((data) => ({ data, error: null })).catch(() => ({ data: null, error: null })),
        supabase.from("ai_configurations").select("enabled").eq("organization_id", org).maybeSingle(),
        supabase.from("conversations").select("id,last_message,last_message_at,contacts(name)").eq("organization_id", org).order("last_message_at", { ascending: false }).limit(5),
        supabase.auth.getUser(),
      ]);
      for (const r of [contacts, usage, ai, recent]) if (r.error) throw r.error;
      const access = sub.data;
      const plan = access && access.status !== "bloqueado" ? { name: access.status === "teste" ? "Teste grátis" : access.planName ?? "", ai_tokens: access.limits.aiTokens } : null;
      const u = user.data.user; setName((u?.user_metadata?.["full_name"] as string)?.split(" ")[0] ?? u?.email?.split("@")[0] ?? "");
      setData({ today, month: monthC, prevMonth: prevC, incoming, outgoing: monthC - incoming, contacts: contacts.data ?? [], tokens: (usage.data ?? []).reduce((s, e) => s + (e.total_tokens ?? 0), 0), allowance: plan?.ai_tokens ?? null, planName: plan?.name ?? null, aiOn: !!ai.data?.enabled, recent: (recent.data as Conversation[]) ?? [] });
    } catch { setError("Os indicadores não puderam ser carregados."); }
  }
  useEffect(() => { void load(); }, [workspace]);

  const d = data;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const leads = d?.contacts.length ?? 0;
  const newC = d?.contacts.filter(c => c.created_at >= monthStart).length ?? 0;
  const qualified = d?.contacts.filter(c => ["qualificado", "proposta", "pagamento", "cliente"].includes(c.stage)).length ?? 0;
  const sales = d?.contacts.filter(c => c.stage === "cliente").length ?? 0;
  const rate = leads ? (sales / leads) * 100 : 0;
  const trend = d && d.prevMonth ? Math.round(((d.month - d.prevMonth) / d.prevMonth) * 100) : null;
  const pct = d?.allowance ? Math.min(100, (d.tokens / d.allowance) * 100) : 0;

  return (
    <AppShell title={`${greet()}${name ? `, ${name}` : ""}`} subtitle="Veja o que está acontecendo na sua operação hoje.">
      {error ? <LoadError message={error} onRetry={() => void load()} /> : !d ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}</div>
      ) : (
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-medium">
            <span className={`size-2 rounded-full ${d.aiOn ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
            {d.aiOn ? "Sexta Feira está online" : "Sexta Feira está desativada"}
            {!d.aiOn && <Link to="/agente-ia" className="text-primary hover:underline">Ativar</Link>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={MessageCircle} label="Mensagens no mês" value={fmt(d.month)} badge={trend === null ? undefined : `${trend >= 0 ? "+" : ""}${trend}%`} up={(trend ?? 0) >= 0}
              rows={[["Hoje", fmt(d.today)], ["Recebidas", fmt(d.incoming)], ["Enviadas", fmt(d.outgoing)]]} />
            <Metric icon={Users} label="Contatos no total" value={fmt(leads)}
              rows={[["Novos", fmt(newC)], ["Qualificados", fmt(qualified)], ["Clientes", fmt(sales)]]} />
            <Card className="card-premium"><CardContent className="p-5">
              <Head icon={Cpu} label="Tokens de IA no mês" />
              <p className="mt-4 text-3xl font-semibold tracking-tight">{fmt(d.tokens)}{d.allowance ? <span className="text-lg text-muted-foreground"> / {fmt(d.allowance)}</span> : null}</p>
              {d.allowance ? <>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-ring transition-all" style={{ width: `${pct}%` }} /></div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{pct.toFixed(0)}% usado</span><span>{fmt(Math.max(0, d.allowance - d.tokens))} restantes{d.planName ? ` · ${d.planName}` : ""}</span></div>
              </> : <p className="mt-3 text-xs text-muted-foreground">Sem plano ativo. <Link to="/planos" className="text-primary hover:underline">Ver planos</Link></p>}
            </CardContent></Card>
            <Metric icon={Target} label="Taxa de conversão" value={`${rate.toFixed(1).replace(".", ",")}%`}
              rows={[["Leads", fmt(leads)], ["Qualificados", fmt(qualified)], ["Vendas", fmt(sales)]]} />
          </div>

          <Card className="card-premium"><CardHeader className="flex-row items-center justify-between"><CardTitle>Conversas recentes</CardTitle><Link to="/inbox" className="text-xs text-primary hover:underline">Ver todas</Link></CardHeader><CardContent>
            {d.recent.length ? <div>{d.recent.map(c => (
              <Link key={c.id} to="/inbox" search={{ conversation: c.id }} className="flex items-center gap-3 rounded-md border-b px-2 py-3 transition-colors last:border-0 hover:bg-muted/50">
                <span className="grid size-9 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{c.contacts?.name?.slice(0, 2).toUpperCase() ?? "CT"}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{c.contacts?.name ?? "Contato"}</p><p className="truncate text-xs text-muted-foreground">{c.last_message?.replace(/[*_#`]/g, "") ?? "Sem mensagens"}</p></div>
                <span className="text-xs text-muted-foreground">{new Date(c.last_message_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </Link>))}</div>
              : <div className="py-12 text-center"><Clock3 className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Nenhuma conversa ainda</p><p className="mt-1 text-xs text-muted-foreground">As novas conversas aparecerão aqui.</p></div>}
          </CardContent></Card>
        </div>
      )}
    </AppShell>
  );
}

function Head({ icon: Icon, label }: { icon: typeof Users; label: string }) {
  return <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{label}</span><span className="grid size-8 place-items-center rounded-lg bg-accent"><Icon className="size-4 text-primary" /></span></div>;
}
function Metric({ icon, label, value, rows, badge, up }: { icon: typeof Users; label: string; value: string; rows: [string, string][]; badge?: string | undefined; up?: boolean | undefined }) {
  return <Card className="card-premium"><CardContent className="p-5">
    <Head icon={icon} label={label} />
    <div className="mt-4 flex items-end gap-2"><p className="text-3xl font-semibold tracking-tight">{value}</p>
      {badge && <span className={`mb-1 inline-flex items-center gap-0.5 text-xs font-medium ${up ? "text-success" : "text-destructive"}`}>{up ? <ArrowUpRight className="size-3" /> : <ArrowDownLeft className="size-3" />}{badge}</span>}</div>
    <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3">{rows.map(([k, v]) => <div key={k}><p className="text-[11px] text-muted-foreground">{k}</p><p className="text-sm font-semibold">{v}</p></div>)}</div>
  </CardContent></Card>;
}
