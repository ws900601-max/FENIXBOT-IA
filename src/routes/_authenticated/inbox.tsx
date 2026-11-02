import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Hand,
  Info,
  MessageCircle,
  MoreHorizontal,
  Package,
  Paperclip,
  Search,
  Send,
  Sparkles,
  Square,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { sendConversationWhatsAppMessage } from "@/lib/whatsapp/whatsapp.functions";
import { sendConversationInstagramMessage } from "@/lib/instagram/instagram.functions";
import { LoadError } from "@/components/app/load-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";

export const Route = createFileRoute("/_authenticated/inbox")({
  validateSearch: (search) => z.object({ conversation: z.string().uuid().optional() }).parse(search),
  head: () => ({
    meta: [
      { title: "Conversas — Fenixbot" },
      { name: "description", content: "Atenda clientes e conduza oportunidades até a venda." },
      { property: "og:title", content: "Conversas — Fenixbot" },
      { property: "og:description", content: "Caixa de entrada comercial da sua equipe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Inbox,
});

type Stage = "novo" | "contato" | "interessado" | "qualificado" | "proposta" | "pagamento" | "cliente";
type Conv = {
  id: string;
  organization_id: string;
  contact_id: string;
  status: string;
  unread_count: number;
  handled_by_ai: boolean;
  channel: string;
  last_message: string | null;
  last_message_at: string;
  contacts: { name: string; phone: string; stage: Stage; lead_score: number; notes: string | null } | null;
};
type Msg = { id: string; sender: string; body: string; sent_at: string };
type Product = { id: string; name: string; price: number; promotional_price: number | null; payment_link: string | null };

const salesSteps: { id: Stage; label: string }[] = [
  { id: "novo", label: "Mensagem" },
  { id: "contato", label: "Atendimento" },
  { id: "interessado", label: "Interesse" },
  { id: "proposta", label: "Produto" },
  { id: "pagamento", label: "Pagamento" },
  { id: "cliente", label: "Venda" },
];

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function Inbox() {
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const { conversation: conversationFromUrl } = Route.useSearch();
  const [items, setItems] = useState<Conv[]>([]);
  const [selected, setSelected] = useState<Conv | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [messageError, setMessageError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todas" | "nao_lidas" | "humano">("todas");
  const [sending, setSending] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const selectedIdRef = useRef<string | null>(null);
  const [aiError, setAiError] = useState("");
  const sendLock = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const sendWhatsApp = useServerFn(sendConversationWhatsAppMessage);
  const sendInstagram = useServerFn(sendConversationInstagramMessage);

  async function load() {
    if (!workspace) return;
    setLoading(true);
    setLoadError("");
    try {
      const [conversationResult, productResult, configResult] = await Promise.all([
      supabase
        .from("conversations")
        .select("id,organization_id,contact_id,channel,status,unread_count,handled_by_ai,last_message,last_message_at,contacts(name,phone,stage,lead_score,notes)")
        .eq("organization_id", workspace.id)
        .order("last_message_at", { ascending: false }),
      supabase
        .from("products")
        .select("id,name,price,promotional_price,payment_link")
        .eq("organization_id", workspace.id)
        .eq("active", true)
        .order("name"),
      supabase.from("ai_configurations").select("enabled").eq("organization_id", workspace.id).maybeSingle(),
      ]);
      const firstError = conversationResult.error ?? productResult.error ?? configResult.error;
      if (firstError) throw firstError;
      const rows = (conversationResult.data as Conv[]) ?? [];
      setItems(rows);
      const requested = rows.find((row) => row.id === conversationFromUrl);
      const next = requested ?? rows[0] ?? null;
      setSelected(next);
      if (next && next.id !== conversationFromUrl) void navigate({ to: "/inbox", search: { conversation: next.id }, replace: true });
      setProducts((productResult.data as Product[]) ?? []);
      setAgentEnabled(configResult.data?.enabled ?? false);
    } catch {
      setLoadError("As conversas não puderam ser carregadas. Sua conexão pode estar instável.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [workspace]);
  useEffect(() => {
    if (!selected || !workspace) return;
    let active = true;
    setMessagesLoading(true);
    setMessageError("");
    setAiError("");
    void supabase
      .from("messages")
      .select("id,sender,body,sent_at")
      .eq("organization_id", workspace.id)
      .eq("conversation_id", selected.id)
      .order("sent_at")
      .then(({ data, error }) => { if (!active) return; if (error) setMessageError("As mensagens desta conversa não puderam ser carregadas."); else setMessages((data as Msg[]) ?? []); setMessagesLoading(false); });
    const channel = supabase.channel(`messages:${selected.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selected.id}` }, (payload) => {
      const message = payload.new as Msg;
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    }).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [selected?.id, workspace]);

  function chooseConversation(conversation: Conv) {
    abortRef.current?.abort();
    setSelected(conversation);
    void navigate({ to: "/inbox", search: { conversation: conversation.id } });
  }

  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;
  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return items.filter((item) => {
      if (filter === "nao_lidas" && item.unread_count === 0) return false;
      if (filter === "humano" && item.handled_by_ai) return false;
      return !term || `${item.contacts?.name ?? ""} ${item.contacts?.phone ?? ""} ${item.last_message ?? ""}`.toLocaleLowerCase("pt-BR").includes(term);
    });
  }, [items, search, filter]);
  const currentStep = useMemo(() => {
    const stage = selected?.contacts?.stage ?? "novo";
    if (stage === "qualificado") return 2;
    return Math.max(0, salesSteps.findIndex((step) => step.id === stage));
  }, [selected?.contacts?.stage]);

  async function updateStage(stage: Stage, successMessage: string) {
    if (!selected || !workspace) return false;
    const { error } = await supabase
      .from("contacts")
      .update({ stage, updated_at: new Date().toISOString() })
      .eq("id", selected.contact_id)
      .eq("organization_id", workspace.id);
    if (error) {
      toast.error("Não foi possível atualizar o lead.");
      return false;
    }
    setSelected({ ...selected, contacts: selected.contacts ? { ...selected.contacts, stage } : null });
    setItems((current) => current.map((item) => item.id === selected.id && item.contacts
      ? { ...item, contacts: { ...item.contacts, stage } }
      : item));
    toast.success(successMessage);
    return true;
  }

  async function setOwner(useAi: boolean) {
    if (!selected || !workspace) return;
    if (useAi && !agentEnabled) {
      toast.error("Ative o agente e conecte um provedor de IA antes de automatizar.");
      return;
    }
    setActionBusy(true);
    const { error } = await supabase
      .from("conversations")
      .update({ handled_by_ai: useAi, updated_at: new Date().toISOString() })
      .eq("id", selected.id)
      .eq("organization_id", workspace.id);
    setActionBusy(false);
    if (error) {
      toast.error("Não foi possível alterar o responsável.");
      return;
    }
    const updated = { ...selected, handled_by_ai: useAi };
    setSelected(updated);
    setItems((current) => current.map((item) => item.id === selected.id ? updated : item));
    toast.success(useAi ? "Conversa devolvida à IA." : "Conversa assumida pela equipe.");
  }

  async function send(bodyOverride?: string, nextStage?: Stage) {
    if (!selected || !workspace || sendLock.current) return;
    const body = (bodyOverride ?? text).trim();
    if (!body) return;
    sendLock.current = true;
    setSending(true);
    let created: { id: string; sender: string; body: string; sent_at: string } | null = null;
    if (selected.channel === "whatsapp" || selected.channel === "instagram") {
      try {
        created = selected.channel === "instagram" ? await sendInstagram({ data: { conversationId: selected.id, body } }) : await sendWhatsApp({ data: { conversationId: selected.id, body } });
      } catch (err) {
        sendLock.current = false;
        setSending(false);
        toast.error(err instanceof Error ? err.message : "Não foi possível enviar a mensagem.");
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("messages")
        .insert({ organization_id: workspace.id, conversation_id: selected.id, sender: "atendente", body })
        .select("id,sender,body,sent_at")
        .single();
      if (error || !data) {
        sendLock.current = false;
        setSending(false);
        toast.error("Não foi possível enviar a mensagem.");
        return;
      }
      created = data;
    }
    const { error: conversationError } = await supabase
      .from("conversations")
      .update({ last_message: body, last_message_at: created.sent_at, handled_by_ai: false, unread_count: 0 })
      .eq("id", selected.id)
      .eq("organization_id", workspace.id);
    if (conversationError) toast.warning("Mensagem enviada, mas a lista pode demorar para atualizar.");
    setText("");
    setMessages((current) => current.some((message) => message.id === created?.id) ? current : [...current, created as Msg]);
    setSelected({ ...selected, handled_by_ai: false, last_message: body, last_message_at: created.sent_at });
    setItems((current) => current.map((item) => item.id === selected.id
      ? { ...item, handled_by_ai: false, last_message: body, last_message_at: created.sent_at }
      : item));
    if (nextStage) await updateStage(nextStage, nextStage === "pagamento" ? "Oferta enviada e lead movido para pagamento." : "Etapa atualizada.");
    else toast.success("Mensagem registrada.");
    sendLock.current = false;
    setSending(false);
  }

  function prepareOffer() {
    if (!selectedProduct) return;
    if (!selectedProduct.payment_link) {
      toast.error("Cadastre o link de pagamento deste produto antes de enviar a oferta.");
      return;
    }
    const price = selectedProduct.promotional_price ?? selectedProduct.price;
    setText(`Separei ${selectedProduct.name} para você por ${money(price)}. Para concluir, acesse: ${selectedProduct.payment_link}`);
    toast.success("Oferta preparada. Revise antes de enviar.");
  }

  async function confirmSale() {
    if (!selected || !workspace) return;
    setActionBusy(true);
    const updated = await updateStage("cliente", "Venda confirmada e lead convertido em cliente.");
    if (updated) {
      await supabase
        .from("conversations")
        .update({ status: "encerrada", handled_by_ai: false, updated_at: new Date().toISOString() })
        .eq("id", selected.id)
        .eq("organization_id", workspace.id);
      setSelected((current) => current ? { ...current, status: "encerrada", handled_by_ai: false } : current);
    }
    setActionBusy(false);
  }

  // Trocar de conversa interrompe o rascunho para ele não cair na conversa errada.
  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null;
    abortRef.current?.abort();
  }, [selected?.id]);

  async function generateAiReply() {
    if (!selected || generating) return;
    if (!agentEnabled) {
      toast.error("Ative o agente antes de gerar uma resposta.");
      return;
    }
    const conversationId = selected.id;
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setAiError("");
    setText("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sua sessão expirou. Entre novamente.");
      const response = await fetch("/api/ai/respond", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ conversationId }), signal: controller.signal });
      if (!response.ok) { const body = await response.json().catch(() => null) as { message?: string } | null; throw new Error(body?.message ?? "Não foi possível gerar a resposta."); }
      if (!response.body) throw new Error("A resposta da IA não pôde ser recebida.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let complete = "";
      const clean = (text: string) => text.replace(/\[\[[A-Z_]+(:[a-z_]+)?\]\]|\[\[[A-Za-z_:]*\]?$/g, "").trim();
      // A resposta vai para a caixa de texto como rascunho: a equipe revisa, edita e decide se envia.
      while (true) { const { done, value } = await reader.read(); if (done) break; complete += decoder.decode(value, { stream: true }); if (selectedIdRef.current === conversationId) setText(clean(complete)); }
      const handoff = complete.includes("[[TRANSFERIR_HUMANO]]");
      const suggestedStage = [...complete.matchAll(/\[\[ETAPA:([a-z_]+)\]\]/g)].map((match) => match[1]).pop();
      complete = clean(complete);
      if (!complete) throw new Error("A IA não retornou uma resposta. Tente novamente.");
      if (selectedIdRef.current === conversationId) setText(complete);
      if (suggestedStage) toast.info(`A Sexta Feira sugere avançar o contato para "${suggestedStage}".`);
      if (handoff) toast.info("A Sexta Feira sugere que uma pessoa da equipe continue este atendimento.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Não foi possível gerar a resposta agora.";
      setAiError(message);
      toast.error(message);
    } finally {
      abortRef.current = null;
      setGenerating(false);
    }
  }

  return <AppShell title="Conversas" subtitle="Atenda, apresente a melhor oferta e acompanhe cada venda.">
    {loadError && !loading ? <LoadError message={loadError} onRetry={() => void load()} /> : <div className="grid h-[calc(100vh-10.5rem)] min-h-[600px] overflow-hidden rounded-md border bg-card lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_280px]">
      <aside className={`${selected ? "hidden lg:block" : "block"} min-w-0 border-r`}>
        <div className="border-b p-3">
          <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversa" /></div>
          <div className="mt-3 flex gap-2 overflow-x-auto" role="group" aria-label="Filtrar conversas">{([["todas", "Todas"], ["nao_lidas", "Não lidas"], ["humano", "Com a equipe"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Badge variant={filter === id ? "default" : "outline"}>{label}</Badge></button>)}</div>
        </div>
        <div className="divide-y">
          {loading ? <div className="space-y-2 p-3"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : filteredItems.map((conversation) => <Button key={conversation.id} variant="ghost" onClick={() => chooseConversation(conversation)} className={`h-auto w-full justify-start rounded-none p-4 text-left ${selected?.id === conversation.id ? "bg-muted/60" : ""}`}>
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{conversation.contacts?.name.slice(0, 2).toUpperCase()}</span>
            <span className="min-w-0 flex-1"><span className="flex justify-between gap-2"><span className="truncate text-sm font-medium">{conversation.contacts?.name}</span><span className="text-[10px] text-muted-foreground">{new Date(conversation.last_message_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></span><span className="mt-1 block truncate text-xs font-normal text-muted-foreground">{conversation.last_message ?? "Nova conversa"}</span></span>
            {conversation.unread_count > 0 && <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">{conversation.unread_count}</span>}
          </Button>)}
          {!loading && !filteredItems.length && <div className="px-6 py-20 text-center"><MessageCircle className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{search ? "Nenhuma conversa encontrada" : "Você ainda não possui conversas"}</p><p className="mt-1 text-xs text-muted-foreground">{search ? "Tente buscar por outro nome, telefone ou mensagem." : "Conecte seu WhatsApp para começar a receber mensagens."}</p></div>}
        </div>
      </aside>

      <section className={`${selected ? "flex" : "hidden lg:flex"} min-w-0 flex-col`}>
        {selected ? <>
          <header className="flex min-h-16 items-center gap-3 border-b px-4">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSelected(null)} aria-label="Voltar">←</Button>
            <span className="grid size-9 place-items-center rounded-full bg-muted text-xs font-semibold">{selected.contacts?.name.slice(0, 2).toUpperCase()}</span>
            <div className="min-w-0"><p className="truncate text-sm font-medium">{selected.contacts?.name}</p><p className="flex items-center gap-1 text-xs text-muted-foreground">{selected.handled_by_ai ? <Bot className="size-3" /> : <Hand className="size-3" />}{selected.handled_by_ai ? "Atendimento pela IA" : "Atendimento humano"}</p></div>
             <Button variant="outline" size="sm" className="ml-auto" disabled={actionBusy} onClick={() => void setOwner(!selected.handled_by_ai)}>{selected.handled_by_ai ? <Hand /> : <Bot />}{selected.handled_by_ai ? "Assumir" : "Passar à IA"}</Button>
            <Button variant="ghost" size="icon" aria-label="Mais opções"><MoreHorizontal /></Button>
          </header>

          <div className="border-b px-4 py-3">
            <div className="flex min-w-max items-center gap-1 overflow-x-auto" aria-label="Progresso da venda">
              {salesSteps.map((step, index) => <div key={step.id} className="flex items-center gap-1"><span className={`grid size-5 place-items-center rounded-full text-[10px] font-semibold ${index <= currentStep ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{index + 1}</span><span className={`text-[11px] ${index <= currentStep ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</span>{index < salesSteps.length - 1 && <span className="mx-1 h-px w-3 bg-border" />}</div>)}
            </div>
          </div>

           <div className="flex-1 space-y-4 overflow-y-auto bg-muted/20 p-4" role="log" aria-live="polite">
             {messagesLoading ? <div className="space-y-3"><Skeleton className="h-14 w-2/3" /><Skeleton className="ml-auto h-14 w-1/2" /></div> : messageError ? <LoadError message={messageError} onRetry={() => { const current = selected; setSelected(null); queueMicrotask(() => setSelected(current)); }} /> : messages.map((message) => <Message key={message.id} from={message.sender === "cliente" ? "user" : "assistant"} className={message.sender === "cliente" ? "mr-auto" : "ml-auto"}><MessageContent className={message.sender === "cliente" ? "border bg-card px-3 py-2" : message.sender === "ia" ? "bg-primary px-3 py-2 text-primary-foreground" : "border border-primary/40 bg-secondary px-3 py-2 text-secondary-foreground"}>{message.sender !== "cliente" && <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">{message.sender === "ia" ? <><Bot className="size-3" />Sexta Feira · IA</> : <><Hand className="size-3" />Equipe</>}</p>}<MessageResponse>{message.body}</MessageResponse><p className="text-right text-[10px] opacity-60">{new Date(message.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p></MessageContent></Message>)}
             {generating && !text && <Message from="assistant" className="ml-auto"><MessageContent className="bg-primary px-3 py-2 text-primary-foreground"><Shimmer className="text-primary-foreground">A Sexta Feira está escrevendo um rascunho…</Shimmer></MessageContent></Message>}
             {aiError && <div role="alert" className="ml-auto max-w-sm rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"><p>{aiError}</p><Button size="sm" variant="outline" className="mt-2" onClick={() => void generateAiReply()}><RefreshCw />Tentar novamente</Button></div>}
             {!messagesLoading && !messages.length && !generating && <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">A conversa ainda não possui mensagens.</div>}
          </div>

          <div className="border-t bg-card p-3">
            <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Select value={selectedProductId} onValueChange={setSelectedProductId}><SelectTrigger aria-label="Selecionar produto"><SelectValue placeholder="Selecionar produto para oferta" /></SelectTrigger><SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name} · {money(product.promotional_price ?? product.price)}{product.payment_link ? "" : " · sem link"}</SelectItem>)}</SelectContent></Select>
               <Button variant="outline" disabled={!selectedProduct || actionBusy} onClick={prepareOffer}><Package />Preparar oferta</Button>
               <Button variant="outline" disabled={selected.contacts?.stage === "cliente" || actionBusy} onClick={() => void updateStage("interessado", "Lead marcado como interessado.")}><Sparkles />Marcar interesse</Button>
            </div>
            {!products.length && <p className="mb-3 text-xs text-warning">Cadastre um produto para preparar uma oferta.</p>}
             <Button variant="outline" className="mb-3 w-full xl:hidden" disabled={!agentEnabled || (!generating && !messages.length)} onClick={() => generating ? abortRef.current?.abort() : void generateAiReply()}>{generating ? <Square /> : <Bot />}{generating ? "Parar rascunho" : "Gerar rascunho com IA"}</Button>
             <div className="flex gap-2"><Button variant="ghost" size="icon" aria-label="Anexar"><Paperclip /></Button><Textarea rows={text.includes("\n") ? 4 : 1} className="min-h-10 resize-none" value={text} readOnly={generating} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (!sending && !generating) void send(); } }} placeholder={generating ? "A Sexta Feira está escrevendo…" : "Digite uma mensagem ou gere um rascunho com IA..."} /><Button size="icon" disabled={sending || generating || !text.trim()} onClick={() => void send(undefined, text.includes("http") ? "pagamento" : undefined)} aria-label="Enviar"><Send /></Button></div>
          </div>
        </> : <div className="grid h-full place-items-center text-muted-foreground"><div className="text-center"><MessageCircle className="mx-auto size-8" /><p className="mt-3 text-sm">Selecione uma conversa</p></div></div>}
      </section>

      <aside className="hidden min-w-0 overflow-y-auto border-l p-4 xl:block">{selected && <>
        <div className="text-center"><span className="mx-auto grid size-14 place-items-center rounded-full bg-muted"><UserRound /></span><p className="mt-3 font-medium">{selected.contacts?.name}</p><p className="text-xs text-muted-foreground">{selected.contacts?.phone}</p></div>
        <div className="mt-6 space-y-3 border-y py-5"><div className="flex justify-between text-sm"><span className="text-muted-foreground">Etapa</span><span className="capitalize">{selected.contacts?.stage}</span></div><div className="flex justify-between text-sm"><span className="text-muted-foreground">Score estimado</span><span>{selected.contacts?.lead_score}/100</span></div><div className="flex justify-between text-sm"><span className="text-muted-foreground">Responsável</span><span>{selected.handled_by_ai ? "IA" : "Equipe"}</span></div></div>
         <div className="mt-5"><p className="flex items-center gap-2 text-sm font-medium"><CircleDollarSign className="size-4 text-primary" />Fechamento</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Confirme somente depois de validar o pagamento.</p><Button className="mt-3 w-full" disabled={selected.contacts?.stage === "cliente" || actionBusy} onClick={() => void confirmSale()}><CheckCircle2 />{selected.contacts?.stage === "cliente" ? "Venda confirmada" : "Confirmar venda"}</Button></div>
         <div className="mt-5"><p className="flex items-center gap-2 text-sm font-medium"><Bot className="size-4 text-primary" />Copiloto de IA</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{agentEnabled ? "Usa todo o histórico deste atendimento, o catálogo e as regras da empresa." : "A IA está desativada. Ative e configure o agente para gerar respostas reais."}</p><Button variant="outline" className="mt-3 w-full" disabled={!agentEnabled || (!generating && !messages.length)} onClick={() => generating ? abortRef.current?.abort() : void generateAiReply()}>{generating ? <Square /> : <Bot />}{generating ? "Parar" : "Gerar resposta"}</Button></div>
        <div className="mt-5 rounded-md bg-muted/40 p-3"><p className="flex items-center gap-2 text-xs font-medium"><Info className="size-4" />Observações</p><p className="mt-2 text-xs text-muted-foreground">{selected.contacts?.notes || "Nenhuma observação adicionada."}</p></div>
      </>}</aside>
    </div>}
  </AppShell>;
}