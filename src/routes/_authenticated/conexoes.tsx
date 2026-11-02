import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Globe, Instagram, Mail, MessageCircle } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/_authenticated/conexoes")({
  head: () => ({ meta: [{ title: "Conexões — Fenixbot" }, { name: "description", content: "Canais conectados ao Fenixbot." }, { property: "og:title", content: "Conexões — Fenixbot" }, { property: "og:description", content: "Status real de cada canal de atendimento." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Conexoes,
});

function Conexoes() {
  const { workspace } = useWorkspace();
  const [ig, setIg] = useState<string | null | undefined>(undefined);
  const [wa, setWa] = useState<string | null | undefined>(undefined);
  useEffect(() => { if (workspace) void supabase.from("whatsapp_accounts").select("status").eq("organization_id", workspace.id).maybeSingle().then(({ data }) => setWa(data?.status ?? null)); if (workspace) void supabase.from("instagram_accounts").select("status").eq("organization_id", workspace.id).maybeSingle().then(({ data }) => setIg(data?.status ?? null)); }, [workspace]);
  const waLabel = wa === undefined ? "Verificando…" : wa === "conectado" ? "Conectado" : "Configuração necessária";
  const soon = [
    { icon: Mail, name: "E-mail", desc: "Receber e responder e-mails pelo Fenixbot." },
    { icon: Globe, name: "Chat no site", desc: "Janela de conversa para colocar no seu site." },
  ];
  return <AppShell title="Conexões" subtitle="Veja quais canais estão ligados ao Fenixbot.">
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardContent className="p-5">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-accent"><MessageCircle className="size-5 text-primary" /></span><div className="flex-1"><p className="font-medium">WhatsApp Business</p><p className="text-xs text-muted-foreground">API oficial da Meta</p></div>
          <span className={`inline-flex items-center gap-1.5 text-xs ${wa === "conectado" ? "text-success" : "text-warning"}`}><span className="size-2 rounded-full bg-current" />{waLabel}</span></div>
        <Button asChild variant="outline" className="mt-4 w-full"><Link to="/whatsapp">Gerenciar</Link></Button>
      </CardContent></Card>
      <Card><CardContent className="p-5">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-accent"><Instagram className="size-5 text-primary" /></span><div className="flex-1"><p className="font-medium">Instagram Direct</p><p className="text-xs text-muted-foreground">API oficial da Meta</p></div>
          <span className={`inline-flex items-center gap-1.5 text-xs ${ig === "conectado" ? "text-success" : "text-warning"}`}><span className="size-2 rounded-full bg-current" />{ig === undefined ? "Verificando…" : ig === "conectado" ? "Conectado" : ig === "atencao" ? "Precisa de atenção" : "Desconectado"}</span></div>
        <Button asChild variant="outline" className="mt-4 w-full"><Link to="/instagram">Gerenciar</Link></Button>
      </CardContent></Card>
      {soon.map(s => <Card key={s.name} className="opacity-80"><CardContent className="p-5">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-muted"><s.icon className="size-5 text-muted-foreground" /></span><div className="flex-1"><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.desc}</p></div>
          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Em breve</span></div>
        <Button variant="outline" className="mt-4 w-full" disabled>Ainda não disponível</Button>
      </CardContent></Card>)}
    </div>
  </AppShell>;
}
