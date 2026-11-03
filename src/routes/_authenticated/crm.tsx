import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Plus, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { LoadError } from "@/components/app/load-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { formatPhone, normalizePhone } from "@/lib/phone";

export const Route = createFileRoute("/_authenticated/crm")({ head: () => ({ meta: [{ title: "CRM — Fenixbot" }, { name: "description", content: "Acompanhe leads e oportunidades no funil de vendas." }, { property: "og:title", content: "CRM — Fenixbot" }, { property: "og:description", content: "Funil comercial conectado às conversas." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: CRM });

const stages = [{ id: "novo", label: "Novo" }, { id: "contato", label: "Contato" }, { id: "interessado", label: "Interessado" }, { id: "qualificado", label: "Qualificado" }, { id: "proposta", label: "Proposta" }, { id: "pagamento", label: "Pagamento" }, { id: "cliente", label: "Cliente" }] as const;
type Stage = typeof stages[number]["id"];
type Contact = { id: string; name: string; phone: string; email: string | null; stage: Stage; lead_score: number; source: string; conversations: { id: string }[] };

function CRM() {
  const { workspace } = useWorkspace();
  const [items, setItems] = useState<Contact[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (!workspace) return;
    setError("");
    const { data, error: loadError } = await supabase.from("contacts").select("id,name,phone,email,stage,lead_score,source,conversations(id)").eq("organization_id", workspace.id).order("updated_at", { ascending: false });
    if (loadError) setError("O funil não pôde ser carregado.");
    else setItems((data as Contact[]) ?? []);
  }, [workspace]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return (items ?? []).filter((c) => !term || `${c.name} ${c.phone} ${c.email ?? ""}`.toLocaleLowerCase("pt-BR").includes(term));
  }, [items, query]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!workspace || saving) return;
    const f = new FormData(e.currentTarget);
    const phone = normalizePhone(String(f.get("phone")));
    if (phone.length < 10) { toast.error("Informe o telefone com DDD."); return; }
    setSaving(true);
    const { error: insertError } = await supabase.from("contacts").insert({ organization_id: workspace.id, name: String(f.get("name")).trim(), phone, email: String(f.get("email")).trim() || null, source: "Cadastro manual" });
    setSaving(false);
    if (insertError) toast.error(insertError.code === "23505" ? "Já existe um contato com este telefone." : "Não foi possível adicionar o contato.");
    else { toast.success("Contato adicionado ao funil."); setOpen(false); void load(); }
  }

  async function move(contact: Contact, stage: Stage) {
    if (moving) return;
    setMoving(contact.id);
    setItems((current) => current?.map((c) => c.id === contact.id ? { ...c, stage } : c) ?? null);
    const { error: moveError } = await supabase.from("contacts").update({ stage, updated_at: new Date().toISOString() }).eq("id", contact.id);
    setMoving("");
    if (moveError) { toast.error("Não foi possível mover o lead."); void load(); }
  }

  return <AppShell title="CRM" subtitle="Conduza cada oportunidade até a venda." action={<Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus />Novo contato</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Adicionar contato</DialogTitle></DialogHeader><form onSubmit={create} className="space-y-4"><div><Label htmlFor="cname">Nome</Label><Input id="cname" name="name" className="mt-2" required /></div><div><Label htmlFor="phone">Telefone com DDD</Label><Input id="phone" name="phone" inputMode="tel" className="mt-2" placeholder="(92) 99999-0000" required /></div><div><Label htmlFor="email">E-mail</Label><Input id="email" name="email" type="email" className="mt-2" /></div><Button className="w-full" disabled={saving}>{saving ? "Adicionando..." : "Adicionar ao funil"}</Button></form></DialogContent></Dialog>}>
    {error ? <LoadError message={error} onRetry={() => void load()} /> : !items ? <Skeleton className="h-96" /> : <>
      <div className="mb-4 flex max-w-sm items-center gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar no funil" value={query} onChange={(e) => setQuery(e.target.value)} /></div></div>
      <div className="grid gap-3 overflow-x-auto pb-4 xl:grid-cols-7">{stages.map((s) => {
        const column = visible.filter((i) => i.stage === s.id);
        return <section key={s.id} className="min-w-64 xl:min-w-0"><div className="mb-3 flex items-center justify-between px-1"><h2 className="text-sm font-medium">{s.label}</h2><span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{column.length}</span></div><div className="min-h-64 space-y-2 rounded-md bg-muted/30 p-2">
          {column.map((c) => <Card key={c.id}><CardContent className="p-3">
            <p className="truncate text-sm font-medium">{c.name}</p>
            <p className="truncate text-xs text-muted-foreground">{formatPhone(c.phone)}</p>
            <select aria-label={`Etapa de ${c.name}`} value={c.stage} disabled={moving === c.id} onChange={(e) => void move(c, e.target.value as Stage)} className="mt-3 h-8 w-full rounded-md border bg-background px-2 text-xs">{stages.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
            {c.conversations[0] && <Link to="/inbox" search={{ conversation: c.conversations[0].id }} className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"><MessageCircle className="size-3" />Abrir conversa</Link>}
          </CardContent></Card>)}
          {!column.length && <div className="grid h-24 place-items-center text-center text-xs text-muted-foreground"><div><UserRound className="mx-auto mb-2 size-4" />Nenhum lead</div></div>}
        </div></section>;
      })}</div>
    </>}
  </AppShell>;
}
