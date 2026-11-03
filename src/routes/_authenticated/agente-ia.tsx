import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Bot, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { LoadError } from "@/components/app/load-state";

export const Route = createFileRoute("/_authenticated/agente-ia")({
  head: () => ({ meta: [
    { title: "Sexta Feira — Fenixbot" },
    { name: "description", content: "Configure o conhecimento, tom, limites e uso da sua Sexta Feira." },
    { property: "og:title", content: "Sexta Feira — Fenixbot" },
    { property: "og:description", content: "Configuração segura do seu assistente comercial." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Agent,
});

type Creativity = "precisa" | "equilibrada" | "criativa";
type Config = { id:string; ai_name:string; business_name:string; business_description:string; products_services:string; prices:string; opening_hours:string; faq:string; company_policies:string; return_policy:string; shipping_info:string; payment_methods:string; tone_of_voice:string; sales_strategy:string; rules:string; forbidden_topics:string; enabled:boolean; auto_reply_whatsapp:boolean; auto_reply_instagram:boolean; creativity:Creativity; history_limit:number };
type Usage = { calls: number; success: number; tokens: number };

// Fica fora do componente da página: recriar o tipo a cada render remontava os campos e apagava o que foi digitado.
function ConfigField({ config, name, label, area = false, readOnly }: { config: Config; name: keyof Config; label: string; area?: boolean | undefined; readOnly: boolean }) {
  return <div><Label htmlFor={name}>{label}</Label>{area ? <Textarea id={name} name={name} defaultValue={String(config[name])} readOnly={readOnly} className="mt-2 min-h-24" /> : <Input id={name} name={name} defaultValue={String(config[name])} readOnly={readOnly} className="mt-2" />}</div>;
}

function Agent() {
  const { workspace } = useWorkspace();
  const [config, setConfig] = useState<Config | null>(null);
  const [usage, setUsage] = useState<Usage>({ calls: 0, success: 0, tokens: 0 });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const canEdit = workspace?.role === "administrador" || workspace?.role === "gerente";

  useEffect(() => {
    if (!workspace) return;
    setLoading(true); setLoadError("");
    void Promise.all([
      supabase.from("ai_configurations").select("id,ai_name,business_name,business_description,products_services,prices,opening_hours,faq,company_policies,return_policy,shipping_info,payment_methods,tone_of_voice,sales_strategy,rules,forbidden_topics,enabled,auto_reply_whatsapp,auto_reply_instagram,creativity,history_limit").eq("organization_id", workspace.id).maybeSingle(),
      supabase.from("ai_usage_events").select("status,total_tokens").eq("organization_id", workspace.id).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
    ]).then(async ([configResult, usageResult]) => {
      if (configResult.error || usageResult.error) throw configResult.error ?? usageResult.error;
      let current = configResult.data as Config | null;
      if (!current && (workspace.role === "administrador" || workspace.role === "gerente")) {
        const created = await supabase.from("ai_configurations").insert({ organization_id: workspace.id, business_name: workspace.name }).select("id,ai_name,business_name,business_description,products_services,prices,opening_hours,faq,company_policies,return_policy,shipping_info,payment_methods,tone_of_voice,sales_strategy,rules,forbidden_topics,enabled,auto_reply_whatsapp,auto_reply_instagram,creativity,history_limit").single();
        current = created.data as Config | null;
      }
      setConfig(current);
      const events = usageResult.data ?? [];
      setUsage({ calls: events.length, success: events.filter((event) => event.status === "sucesso").length, tokens: events.reduce((sum, event) => sum + (event.total_tokens ?? 0), 0) });
    }).catch(() => setLoadError("A configuração da IA não pôde ser carregada.")).finally(() => setLoading(false));
  }, [workspace]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !config || !canEdit || saving) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload = {
      ai_name: String(form.get("ai_name")), business_name: String(form.get("business_name")), business_description: String(form.get("business_description")), products_services: String(form.get("products_services")), prices: String(form.get("prices")), return_policy: String(form.get("return_policy")), shipping_info: String(form.get("shipping_info")), opening_hours: String(form.get("opening_hours")), faq: String(form.get("faq")), company_policies: String(form.get("company_policies")), payment_methods: String(form.get("payment_methods")), tone_of_voice: String(form.get("tone_of_voice")), sales_strategy: String(form.get("sales_strategy")), rules: String(form.get("rules")), forbidden_topics: String(form.get("forbidden_topics")), enabled: config.enabled, auto_reply_whatsapp: config.auto_reply_whatsapp, auto_reply_instagram: config.auto_reply_instagram, creativity: config.creativity, history_limit: config.history_limit, updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("ai_configurations").upsert({ id: config.id, organization_id: workspace.id, ...payload });
    setSaving(false);
    if (error) toast.error("Não foi possível salvar a configuração."); else toast.success("Configuração da IA salva.");
  }

  if (loading) return <AppShell title="Sexta Feira" subtitle="Carregando configuração..."><div className="h-80 animate-pulse rounded-md bg-muted" /></AppShell>;
  if (loadError || !config) return <AppShell title="Sexta Feira" subtitle="Configure o atendimento da sua empresa."><LoadError message={loadError || "A configuração da IA ainda não existe."} onRetry={() => window.location.reload()} /></AppShell>;

  return <AppShell title="Sexta Feira" subtitle="Ensine sua IA a atender de acordo com sua empresa.">
    <form onSubmit={save} className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Bot className="size-5 text-primary" />Identidade e contexto</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><ConfigField config={config} readOnly={!canEdit} name="ai_name" label="Nome da IA" /><ConfigField config={config} readOnly={!canEdit} name="business_name" label="Nome da empresa" /><div className="md:col-span-2"><ConfigField config={config} readOnly={!canEdit} name="business_description" label="Descrição da empresa" area /></div><ConfigField config={config} readOnly={!canEdit} name="products_services" label="Produtos e serviços" area /><ConfigField config={config} readOnly={!canEdit} name="opening_hours" label="Horários de atendimento" area /></CardContent></Card>
        <Card><CardHeader><CardTitle>Conhecimento comercial</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><ConfigField config={config} readOnly={!canEdit} name="faq" label="Perguntas frequentes" area /><ConfigField config={config} readOnly={!canEdit} name="prices" label="Preços e condições" area /><ConfigField config={config} readOnly={!canEdit} name="company_policies" label="Políticas da empresa" area /><ConfigField config={config} readOnly={!canEdit} name="payment_methods" label="Formas de pagamento" area /><ConfigField config={config} readOnly={!canEdit} name="return_policy" label="Trocas e devoluções" area /><ConfigField config={config} readOnly={!canEdit} name="shipping_info" label="Entrega e frete" area /><div className="md:col-span-2"><ConfigField config={config} readOnly={!canEdit} name="sales_strategy" label="Estratégia de vendas" area /></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Comportamento e segurança</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><ConfigField config={config} readOnly={!canEdit} name="tone_of_voice" label="Tom de voz" /><div /><ConfigField config={config} readOnly={!canEdit} name="rules" label="Regras obrigatórias" area /><ConfigField config={config} readOnly={!canEdit} name="forbidden_topics" label="Assuntos proibidos" area /></CardContent></Card>
      </div>
      <aside className="space-y-4">
        <Card><CardHeader><CardTitle>Status do agente</CardTitle></CardHeader><CardContent><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">Ativar agente</p><p className="mt-1 text-xs text-muted-foreground">Permite gerar respostas reais nas conversas.</p></div><Switch checked={config.enabled} disabled={!canEdit} onCheckedChange={(enabled) => setConfig({ ...config, enabled })} /></div><div className="mt-5 flex items-center justify-between gap-4 border-t pt-5"><div><p className="text-sm font-medium">Responder automaticamente no WhatsApp</p><p className="mt-1 text-xs text-muted-foreground">Envia a resposta pela API oficial enquanto a conversa estiver com a IA.</p></div><Switch checked={config.auto_reply_whatsapp} disabled={!canEdit || !config.enabled} onCheckedChange={(auto_reply_whatsapp) => setConfig({ ...config, auto_reply_whatsapp })} /></div><div className="mt-5 flex items-center justify-between gap-4 border-t pt-5"><div><p className="text-sm font-medium">Responder automaticamente no Instagram</p><p className="mt-1 text-xs text-muted-foreground">Responde no Direct enquanto a conversa estiver com a IA.</p></div><Switch checked={config.auto_reply_instagram} disabled={!canEdit || !config.enabled} onCheckedChange={(auto_reply_instagram) => setConfig({ ...config, auto_reply_instagram })} /></div><div className="mt-5 grid gap-4"><div><Label>Estilo de resposta</Label><Select value={config.creativity} onValueChange={(value: Creativity) => setConfig({ ...config, creativity: value })}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="precisa">Precisa</SelectItem><SelectItem value="equilibrada">Equilibrada</SelectItem><SelectItem value="criativa">Criativa</SelectItem></SelectContent></Select></div><div><Label htmlFor="history_limit">Mensagens consideradas</Label><Input id="history_limit" type="number" min={4} max={30} value={config.history_limit} onChange={(event) => setConfig({ ...config, history_limit: Math.min(30, Math.max(4, Number(event.target.value) || 4)) })} className="mt-2" /></div></div>{canEdit ? <Button className="mt-5 w-full" disabled={saving}><Save />{saving ? "Salvando..." : "Salvar configuração"}</Button> : <p className="mt-5 text-xs text-muted-foreground">Somente administradores e gerentes podem alterar a Sexta Feira.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="size-4 text-primary" />Uso nos últimos 30 dias</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-2 text-center"><div><p className="text-xl font-semibold">{usage.calls}</p><p className="text-[11px] text-muted-foreground">Execuções</p></div><div><p className="text-xl font-semibold">{usage.success}</p><p className="text-[11px] text-muted-foreground">Respostas</p></div><div><p className="text-xl font-semibold">{usage.tokens.toLocaleString("pt-BR")}</p><p className="text-[11px] text-muted-foreground">Tokens</p></div></CardContent></Card>
        <Card><CardContent className="flex gap-3 p-4"><ShieldCheck className="size-5 shrink-0 text-success" /><p className="text-xs leading-relaxed text-muted-foreground">O agente usa somente o contexto desta empresa. Mensagens e dados comerciais não são gravados nas métricas.</p></CardContent></Card>
      </aside>
    </form>
  </AppShell>;
}