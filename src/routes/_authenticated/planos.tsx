import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/app/load-state";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { createSubscriptionCheckout, getBillingSetup, getPlanStatus, manageSubscription } from "@/lib/billing/billing.functions";

export const Route = createFileRoute("/_authenticated/planos")({
  head: () => ({ meta: [{ title: "Planos e assinatura — Fenixbot" }, { name: "description", content: "Escolha o plano ideal e acompanhe sua assinatura e o uso de IA." }, { property: "og:title", content: "Planos e assinatura — Fenixbot" }, { property: "og:description", content: "Planos Nano, Ouro e Pro do Fenixbot." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Plans,
});

type Plan = { id: string; name: string; description: string; monthly_price: number; yearly_discount_percent: number; ai_tokens: number; connections: number; attendants: number | null; features: string[]; popular: boolean; cta: string };
type Sub = { plan_id: string; status: string; billing_cycle: string; next_billing_at: string | null };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const millions = (v: number) => `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
const statusLabel: Record<string, string> = { ativa: "Ativa", pendente: "Pendente", atrasada: "Em atraso", pausada: "Pausada", cancelada: "Cancelada", expirada: "Expirada" };

function Plans() {
  const { workspace } = useWorkspace();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Sub | null>(null);
  const [tokens, setTokens] = useState(0);
  const [yearly, setYearly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [billingReady, setBillingReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [access, setAccess] = useState<Awaited<ReturnType<typeof getPlanStatus>> | null>(null);
  const loadAccess = useServerFn(getPlanStatus);
  const loadBilling = useServerFn(getBillingSetup);
  const checkout = useServerFn(createSubscriptionCheckout);
  const manage = useServerFn(manageSubscription);
  const isAdmin = workspace?.role === "administrador";

  useEffect(() => {
    void loadBilling().then((r) => setBillingReady(r.configured)).catch(() => setBillingReady(false));
    if (new URLSearchParams(window.location.search).get("retorno") === "mercadopago") toast.success("Pagamento enviado. A assinatura é ativada assim que o Mercado Pago confirmar.");
  }, []);

  async function subscribe(planId: string) {
    if (!workspace) return;
    setBusy(planId);
    try {
      const { checkoutUrl } = await checkout({ data: { organizationId: workspace.id, planId, cycle: yearly ? "anual" : "mensal" } });
      window.location.href = checkoutUrl;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível abrir o pagamento."); setBusy(null); }
  }

  async function changeStatus(action: "pausar" | "cancelar" | "reativar") {
    if (!workspace) return;
    if (action === "cancelar" && !window.confirm("Cancelar a assinatura? As cobranças futuras serão interrompidas.")) return;
    setBusy(action);
    try { await manage({ data: { organizationId: workspace.id, action } }); await load(); toast.success("Assinatura atualizada."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível atualizar a assinatura."); }
    finally { setBusy(null); }
  }

  async function load() {
    if (!workspace) return;
    setLoading(true); setError("");
    try {
      const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
      const [p, s, u] = await Promise.all([
        supabase.from("plans").select("*").order("sort_order"),
        supabase.from("subscriptions").select("plan_id,status,billing_cycle,next_billing_at").eq("organization_id", workspace.id).maybeSingle(),
        supabase.from("ai_usage_events").select("total_tokens").eq("organization_id", workspace.id).gte("created_at", since.toISOString()),
      ]);
      if (p.error || s.error || u.error) throw p.error ?? s.error ?? u.error;
      setPlans((p.data ?? []).map((x) => ({ ...x, monthly_price: Number(x.monthly_price), ai_tokens: Number(x.ai_tokens) })) as Plan[]);
      setSub(s.data);
      setTokens((u.data ?? []).reduce((a, r) => a + (r.total_tokens ?? 0), 0));
      setAccess(await loadAccess({ data: { organizationId: workspace.id } }).catch(() => null));
    } catch { setError("Os planos não puderam ser carregados."); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [workspace]);

  const current = plans.find((p) => p.id === sub?.plan_id);
  const price = (p: Plan) => yearly ? p.monthly_price * 12 * (1 - p.yearly_discount_percent / 100) : p.monthly_price;

  return (
    <AppShell title="Planos e assinatura" subtitle="Centralize conversas, automatize vendas e deixe a IA atender 24 horas.">
      {loading ? <Skeleton className="h-96 w-full" /> : error ? <LoadError message={error} onRetry={() => void load()} /> : <>
        {access?.status === "teste" && access.trialEndsAt && <div className="mb-4 rounded-md border border-primary/40 bg-primary/5 p-4 text-sm">Você está no <strong>teste grátis</strong> com os limites do plano Nano até <strong>{new Date(access.trialEndsAt).toLocaleDateString("pt-BR")}</strong>. Assine um plano para continuar depois disso.</div>}
        {access?.status === "bloqueado" && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">O teste grátis terminou. A IA e novas conexões ficam pausadas até você assinar um plano; as conversas continuam com a equipe.</div>}
        <Card className="mb-6"><CardContent className="grid gap-4 p-5 sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Plano atual</p><p className="mt-1 font-semibold">{current ? `${current.name} · ${brl(current.monthly_price)}/mês` : "Nenhum plano ativo"}</p></div>
          <div><p className="text-xs text-muted-foreground">Situação</p><p className="mt-1 font-semibold">{sub ? statusLabel[sub.status] ?? sub.status : "Sem assinatura"}</p></div>
          <div><p className="text-xs text-muted-foreground">Próximo pagamento</p><p className="mt-1 font-semibold">{sub?.next_billing_at ? new Date(sub.next_billing_at).toLocaleDateString("pt-BR") : "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Tokens de IA neste mês</p><p className="mt-1 font-semibold">{millions(tokens)}{access && access.limits.aiTokens > 0 ? ` / ${millions(access.limits.aiTokens)}` : current ? ` / ${millions(current.ai_tokens)}` : ""}</p></div>
        </CardContent>
        {isAdmin && sub && ["ativa", "atrasada", "pausada"].includes(sub.status) && <CardContent className="flex flex-wrap gap-2 border-t p-4">
          {sub.status === "pausada" ? <Button size="sm" disabled={!!busy} onClick={() => void changeStatus("reativar")}>Reativar assinatura</Button> : <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void changeStatus("pausar")}>Pausar assinatura</Button>}
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void changeStatus("cancelar")}>Cancelar assinatura</Button>
        </CardContent>}
        </Card>

        <div className="mb-6 flex justify-center"><div className="inline-flex rounded-md border p-1">
          {[false, true].map((y) => <Button key={String(y)} size="sm" variant={yearly === y ? "default" : "ghost"} onClick={() => setYearly(y)}>{y ? "Anual" : "Mensal"}</Button>)}
        </div></div>

        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = p.id === sub?.plan_id && sub.status === "ativa";
            return <Card key={p.id} className={p.popular ? "border-primary" : ""}><CardContent className="flex h-full flex-col p-6">
              <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{p.name}</h2>
                {isCurrent ? <span className="rounded bg-success/15 px-2 py-0.5 text-xs text-success">Plano atual</span> : p.popular && <span className="rounded bg-primary/15 px-2 py-0.5 text-xs text-primary">Mais escolhido</span>}</div>
              <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>
              <p className="mt-5 text-3xl font-semibold">{brl(price(p))}<span className="text-sm font-normal text-muted-foreground">/{yearly ? "ano" : "mês"}</span></p>
              {yearly && p.yearly_discount_percent > 0 && <p className="text-xs text-success">Economize {p.yearly_discount_percent}%</p>}
              <ul className="mt-5 flex-1 space-y-2 text-sm">{p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{f}</li>)}</ul>
              <Button className="mt-6" disabled={isCurrent || !billingReady || !isAdmin || !!busy} onClick={() => void subscribe(p.id)} variant={p.popular ? "default" : "outline"}>{isCurrent ? "Plano atual" : busy === p.id ? "Abrindo pagamento..." : p.cta}</Button>
              {!isCurrent && !billingReady && <p className="mt-2 text-center text-xs text-muted-foreground">Pagamento disponível após conectar o Mercado Pago.</p>}
              {!isCurrent && billingReady && !isAdmin && <p className="mt-2 text-center text-xs text-muted-foreground">Somente administradores podem assinar.</p>}
            </CardContent></Card>;
          })}
        </div>

        <Card className="mt-6"><CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[520px] text-sm"><thead><tr className="border-b"><th className="p-3 text-left font-medium">Recurso</th>{plans.map((p) => <th key={p.id} className="p-3 text-left font-medium">{p.name}</th>)}</tr></thead>
            <tbody>
              <tr className="border-b"><td className="p-3 text-muted-foreground">Tokens de IA</td>{plans.map((p) => <td key={p.id} className="p-3">{millions(p.ai_tokens)}</td>)}</tr>
              <tr className="border-b"><td className="p-3 text-muted-foreground">Conexões</td>{plans.map((p) => <td key={p.id} className="p-3">{p.connections}</td>)}</tr>
              <tr><td className="p-3 text-muted-foreground">Atendentes</td>{plans.map((p) => <td key={p.id} className="p-3">{p.attendants ?? "Ilimitados"}</td>)}</tr>
            </tbody></table>
        </CardContent></Card>
      </>}
    </AppShell>
  );
}
