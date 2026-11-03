import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Bot, Boxes, ChevronDown, Cpu, CreditCard, Inbox, Instagram, Plug, Users, UserCog, LayoutDashboard, LogOut, Menu, MessageCircle, Package, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { takePendingInvite } from "@/lib/team/pending-invite";
import { supabase } from "@/integrations/supabase/client";
import { clearWorkspaceCache, useWorkspace, type Workspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/app/load-state";
import fenixbotMark from "@/assets/fenixbot-mark.png";

const items = [
  { to: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { to: "/inbox", label: "Conversas", icon: Inbox },
  { to: "/crm", label: "CRM", icon: Boxes },
  { to: "/contatos", label: "Contatos", icon: Users },
  { to: "/produtos", label: "Produtos", icon: Package },
  { to: "/agente-ia", label: "Sexta Feira", icon: Bot },
  { to: "/tokens", label: "Tokens de IA", icon: Cpu },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/instagram", label: "Instagram", icon: Instagram },
  { to: "/conexoes", label: "Conexões", icon: Plug },
  { to: "/equipe", label: "Equipe", icon: UserCog },
  { to: "/planos", label: "Planos", icon: CreditCard },
] as const;

function Brand() { return <div className="flex h-16 items-center gap-2.5 px-5"><img src={fenixbotMark} alt="" width={32} height={32} className="size-8 object-contain" /><strong className="text-lg">Fenixbot</strong></div>; }

function Navigation({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const pathname = useLocation({ select: (s) => s.pathname });
  return <nav className="space-y-1 px-3">{items.map((item) => { const active = pathname === item.to; const Icon = item.icon; return <Link key={item.to} to={item.to} onClick={onNavigate} className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"}`}><Icon className="size-4" />{item.label}</Link>; })}</nav>;
}

function Sidebar({ workspace, onNavigate }: { workspace: Workspace; onNavigate?: (() => void) | undefined }) { const [connected, setConnected] = useState(false); useEffect(() => { void supabase.from("whatsapp_accounts").select("status").eq("organization_id", workspace.id).maybeSingle().then(({ data }) => setConnected(data?.status === "conectado")); }, [workspace.id]); return <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar"><Brand /><Navigation onNavigate={onNavigate} /><div className="mt-auto border-t border-sidebar-border p-4"><Link to="/whatsapp" onClick={onNavigate} className="block rounded-md border border-border bg-muted/40 p-3"><div className="mb-1 flex items-center gap-2 text-xs font-medium"><span className={`size-2 rounded-full ${connected ? "bg-success" : "bg-warning"}`} />{connected ? "WhatsApp conectado" : "WhatsApp não conectado"}</div><p className="text-xs text-muted-foreground">{connected ? "Pronto para receber mensagens reais." : "Conecte sua conta oficial da Meta."}</p></Link></div></div>; }

function SetupOrganization({ onReady }: { onReady: () => void }) {
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function create() { setBusy(true); setError(""); const { data: userData } = await supabase.auth.getUser(); const user = userData.user; if (!user) return; const slug = `${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${user.id.slice(0, 6)}`; const { data: org, error: orgError } = await supabase.from("organizations").insert({ name, slug, created_by: user.id }).select("id").single(); if (orgError || !org) { setError("Não foi possível criar sua empresa. Tente novamente."); setBusy(false); return; } const { error: roleError } = await supabase.from("user_roles").insert({ organization_id: org.id, user_id: user.id, role: "administrador" }); if (roleError) { setError("Empresa criada, mas o acesso não foi concluído. Tente novamente."); setBusy(false); return; } await supabase.from("ai_configurations").insert({ organization_id: org.id, business_name: name }); onReady(); }
  return <main className="grid min-h-screen place-items-center bg-background p-6"><section className="w-full max-w-md"><Brand /><div className="mt-10"><span className="text-xs font-medium uppercase text-primary">Primeiro passo</span><h1 className="mt-3 text-3xl font-semibold">Crie seu espaço de trabalho</h1><p className="mt-2 text-sm text-muted-foreground">Seus contatos, conversas e produtos ficarão isolados nesta empresa.</p><label className="mt-8 block text-sm font-medium" htmlFor="company">Nome da empresa</label><Input id="company" className="mt-2 h-11" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Aurora Comércio" />{error && <p className="mt-3 text-sm text-destructive">{error}</p>}<Button className="mt-5 h-11 w-full" disabled={busy || name.trim().length < 2} onClick={create}>{busy ? "Criando..." : "Criar empresa"}</Button></div></section></main>;
}

export function AppShell({ title, subtitle, action, children }: { title: string; subtitle: string; action?: ReactNode; children: ReactNode }) {
  const { workspace, loading, needsSetup, error, reload } = useWorkspace(); const navigate = useNavigate(); const [open, setOpen] = useState(false);
  // Quem entrou pelo link de um convite volta para ele depois do login.
  useEffect(() => { const token = takePendingInvite(); if (token) void navigate({ to: "/convite/$token", params: { token } }); }, [navigate]);
  if (loading) return <div className="flex min-h-screen"><aside className="hidden w-60 border-r lg:block" /><main className="flex-1 p-8"><Skeleton className="h-10 w-64" /><Skeleton className="mt-8 h-96 w-full" /></main></div>;
  if (error) return <main className="grid min-h-screen place-items-center bg-background p-6"><div className="w-full max-w-lg"><LoadError message={error} onRetry={() => void reload()} /></div></main>;
  if (needsSetup || !workspace) return <SetupOrganization onReady={reload} />;
  async function signOut() { clearWorkspaceCache(); await supabase.auth.signOut(); await navigate({ to: "/auth", replace: true }); }
  return <div className="min-h-screen bg-background"><aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block"><Sidebar workspace={workspace} /></aside><div className="lg:pl-60"><header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur md:px-6"><Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu"><Menu /></Button></SheetTrigger><SheetContent side="left" className="w-64 p-0"><Sidebar workspace={workspace} onNavigate={() => setOpen(false)} /></SheetContent></Sheet><div className="relative hidden max-w-sm flex-1 md:block"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar contatos (Enter)" aria-label="Buscar contatos" onKeyDown={(e) => { if (e.key === "Enter") { const q = e.currentTarget.value.trim(); void navigate({ to: "/contatos", search: q ? { q } : {} }); } }} /></div><div className="ml-auto flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-medium">{workspace.name}</p><p className="text-xs capitalize text-muted-foreground">{workspace.role}</p></div><Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair"><LogOut /></Button><ChevronDown className="hidden size-4 text-muted-foreground sm:block" /></div></header><main className="p-4 md:p-6 lg:p-8"><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-semibold md:text-3xl">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></div>{action}</div>{typeof children === "function" ? null : children}</main></div></div>;
}
