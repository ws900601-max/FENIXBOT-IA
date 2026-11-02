import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CreditCard, ExternalLink, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({ meta: [{ title: "Produtos — Fenixbot" }, { name: "description", content: "Gerencie produtos, preços e links de pagamento." }, { property: "og:title", content: "Produtos — Fenixbot" }, { property: "og:description", content: "Catálogo comercial da sua empresa." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Products,
});

type Product = { id: string; name: string; description: string | null; price: number; promotional_price: number | null; payment_link: string | null; stock_status: string; active: boolean };

function isValidPaymentLink(value: string) {
  if (!value) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function Products() {
  const { workspace } = useWorkspace();
  const [items, setItems] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  async function load() {
    if (!workspace) return;
    const { data } = await supabase.from("products").select("id,name,description,price,promotional_price,payment_link,stock_status,active").eq("organization_id", workspace.id).order("created_at", { ascending: false });
    setItems((data as Product[]) ?? []);
  }
  useEffect(() => { void load(); }, [workspace]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    const form = new FormData(event.currentTarget);
    const paymentLink = String(form.get("payment_link")).trim();
    if (!isValidPaymentLink(paymentLink)) {
      toast.error("Use um link de pagamento seguro iniciado por https://.");
      return;
    }
    const payload = {
      organization_id: workspace.id,
      name: String(form.get("name")).trim(),
      description: String(form.get("description")).trim() || null,
      price: Number(form.get("price")),
      promotional_price: form.get("promo") ? Number(form.get("promo")) : null,
      payment_link: paymentLink || null,
      updated_at: new Date().toISOString(),
    };
    const result = editing
      ? await supabase.from("products").update(payload).eq("id", editing.id).eq("organization_id", workspace.id)
      : await supabase.from("products").insert(payload);
    if (result.error) toast.error("Não foi possível salvar o produto.");
    else {
      toast.success(editing ? "Produto atualizado." : "Produto cadastrado.");
      setOpen(false);
      setEditing(null);
      void load();
    }
  }

  async function remove(id: string) {
    if (!workspace) return;
    const { error } = await supabase.from("products").delete().eq("id", id).eq("organization_id", workspace.id);
    if (error) toast.error("Não foi possível excluir."); else void load();
  }

  function openNew() { setEditing(null); setOpen(true); }
  function openEdit(product: Product) { setEditing(product); setOpen(true); }

  return <AppShell title="Produtos" subtitle="Organize o catálogo usado nas ofertas e vendas." action={<Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setEditing(null); }}><DialogTrigger asChild><Button onClick={openNew}><Plus />Novo produto</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{editing ? "Editar produto" : "Cadastrar produto"}</DialogTitle></DialogHeader><form key={editing?.id ?? "new"} onSubmit={save} className="space-y-4"><div><Label htmlFor="pname">Nome</Label><Input id="pname" name="name" className="mt-2" defaultValue={editing?.name ?? ""} required /></div><div><Label htmlFor="desc">Descrição</Label><Textarea id="desc" name="description" className="mt-2" defaultValue={editing?.description ?? ""} /></div><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="price">Preço</Label><Input id="price" name="price" type="number" step="0.01" min="0" className="mt-2" defaultValue={editing?.price ?? ""} required /></div><div><Label htmlFor="promo">Promocional</Label><Input id="promo" name="promo" type="number" step="0.01" min="0" className="mt-2" defaultValue={editing?.promotional_price ?? ""} /></div></div><div><Label htmlFor="payment_link">Link de pagamento</Label><Input id="payment_link" name="payment_link" type="url" className="mt-2" placeholder="https://..." defaultValue={editing?.payment_link ?? ""} /><p className="mt-1 text-xs text-muted-foreground">Use o link seguro fornecido pelo seu meio de pagamento.</p></div><Button className="w-full">{editing ? "Salvar alterações" : "Salvar produto"}</Button></form></DialogContent></Dialog>}>
    {items.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((product) => <Card key={product.id}><CardContent className="p-5"><div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-md bg-muted"><Package className="size-5" /></span><div className="flex"><Button variant="ghost" size="icon" onClick={() => openEdit(product)} aria-label="Editar produto"><Pencil /></Button><Button variant="ghost" size="icon" onClick={() => void remove(product.id)} aria-label="Excluir produto"><Trash2 /></Button></div></div><h2 className="mt-5 font-semibold">{product.name}</h2><p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">{product.description || "Sem descrição"}</p><div className="mt-5 flex items-end justify-between"><div>{product.promotional_price && <p className="text-xs text-muted-foreground line-through">R$ {Number(product.price).toFixed(2).replace(".", ",")}</p>}<p className="text-lg font-semibold">R$ {Number(product.promotional_price ?? product.price).toFixed(2).replace(".", ",")}</p></div><Badge variant="outline">Disponível</Badge></div><div className="mt-4 border-t pt-4">{product.payment_link ? <a href={product.payment_link} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-primary"><CreditCard className="size-4" />Link de pagamento pronto<ExternalLink className="ml-auto size-3" /></a> : <p className="flex items-center gap-2 text-xs text-warning"><CreditCard className="size-4" />Link de pagamento pendente</p>}</div></CardContent></Card>)}</div> : <div className="grid min-h-80 place-items-center rounded-md border border-dashed"><div className="text-center"><Package className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-4 font-medium">Você ainda não cadastrou produtos</h2><p className="mt-1 text-sm text-muted-foreground">Adicione seu catálogo para preparar ofertas nas conversas.</p></div></div>}
  </AppShell>;
}