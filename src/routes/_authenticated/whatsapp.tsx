import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, MessageCircle, RefreshCw, ShieldCheck, Unplug, Wifi } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/use-workspace";
import { LoadError } from "@/components/app/load-state";
import { completeWhatsAppEmbeddedSignup, connectWhatsApp, disconnectWhatsApp, getWhatsAppSetup, testWhatsAppConnection } from "@/lib/whatsapp/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({ meta: [
    { title: "WhatsApp — Fenixbot" },
    { name: "description", content: "Conecte sua conta oficial do WhatsApp Business ao Fenixbot." },
    { property: "og:title", content: "WhatsApp — Fenixbot" },
    { property: "og:description", content: "Configuração da integração oficial com o WhatsApp Business." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: WhatsAppSettings,
});

type EmbeddedSignupConfig = { appId: string; configId: string };
type FacebookSdk = { init: (options: Record<string, unknown>) => void; login: (callback: (response: { authResponse?: { code?: string } | null }) => void, options: Record<string, unknown>) => void };
declare global { interface Window { FB?: FacebookSdk; fbAsyncInit?: () => void } }

let facebookSdkPromise: Promise<FacebookSdk> | undefined;
function loadFacebookSdk(appId: string) {
  facebookSdkPromise ??= new Promise<FacebookSdk>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v23.0" });
      resolve(window.FB!);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => { facebookSdkPromise = undefined; reject(new Error("Não foi possível carregar o login da Meta.")); };
    document.body.appendChild(script);
  });
  return facebookSdkPromise;
}

// Abre o cadastro integrado da Meta e devolve o código de autorização com o número escolhido pelo cliente.
async function runEmbeddedSignup(config: EmbeddedSignupConfig) {
  const fb = await loadFacebookSdk(config.appId);
  return new Promise<{ code: string; wabaId: string; phoneNumberId: string }>((resolve, reject) => {
    let session: { wabaId: string; phoneNumberId: string } | null = null;
    let code: string | null = null;
    const finish = () => {
      if (!code || !session) return;
      window.removeEventListener("message", onMessage);
      resolve({ code, ...session });
    };
    function onMessage(event: MessageEvent) {
      if (!/(^|\.)facebook\.com$/.test(new URL(event.origin).hostname)) return;
      try {
        const payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (payload.event === "CANCEL" || payload.event === "ERROR") { window.removeEventListener("message", onMessage); reject(new Error("A conexão com a Meta foi cancelada.")); return; }
        if (payload.data?.waba_id && payload.data?.phone_number_id) { session = { wabaId: payload.data.waba_id, phoneNumberId: payload.data.phone_number_id }; finish(); }
      } catch { /* mensagens de outros scripts da Meta */ }
    }
    window.addEventListener("message", onMessage);
    fb.login((response) => {
      code = response.authResponse?.code ?? null;
      if (!code) { window.removeEventListener("message", onMessage); reject(new Error("A conexão com a Meta foi cancelada.")); return; }
      // O evento com o número pode chegar um instante depois do login.
      setTimeout(() => { if (!session) { window.removeEventListener("message", onMessage); reject(new Error("Selecione um número de WhatsApp para concluir a conexão.")); } }, 10000);
      finish();
    }, { config_id: config.configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "", sessionInfoVersion: "3" } });
  });
}

type Account = { id:string; waba_id:string; phone_number_id:string; app_id:string|null; business_name:string|null; display_phone_number:string|null; status:string; last_error:string|null; last_sync_at:string|null; connected_at:string|null };

function WhatsAppSettings() {
  const { workspace } = useWorkspace();
  const loadSetup = useServerFn(getWhatsAppSetup);
  const connect = useServerFn(connectWhatsApp);
  const testConnection = useServerFn(testWhatsAppConnection);
  const disconnect = useServerFn(disconnectWhatsApp);
  const completeSignup = useServerFn(completeWhatsAppEmbeddedSignup);
  const [embeddedSignup, setEmbeddedSignup] = useState<EmbeddedSignupConfig | null>(null);
  const [manualAvailable, setManualAvailable] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const [account, setAccount] = useState<Account | null>(null);
  const [credentialsConfigured, setCredentialsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const canManage = workspace?.role === "administrador" || workspace?.role === "gerente";

  async function load() {
    if (!workspace) return;
    setLoading(true); setLoadError("");
    try { const result = await loadSetup({ data: { organizationId: workspace.id } }); setAccount(result.account as Account | null); setCredentialsConfigured(result.credentialsConfigured); setEmbeddedSignup(result.embeddedSignup); setManualAvailable(result.manualConnectionAvailable); }
    catch { setLoadError("A configuração do WhatsApp não pôde ser carregada."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [workspace]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !canManage) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const connected = await connect({ data: { organizationId: workspace.id, wabaId: String(form.get("waba_id")), phoneNumberId: String(form.get("phone_number_id")), appId: String(form.get("app_id")) } });
      setAccount(connected as Account);
      toast.success("WhatsApp conectado e validado pela Meta.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível conectar o WhatsApp."); }
    finally { setBusy(false); }
  }

  async function connectWithMeta() {
    if (!workspace || !embeddedSignup) return;
    setBusy(true);
    try {
      const session = await runEmbeddedSignup(embeddedSignup);
      const connected = await completeSignup({ data: { organizationId: workspace.id, ...session } });
      setAccount(connected as Account);
      toast.success("WhatsApp conectado com sucesso.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível conectar o WhatsApp."); }
    finally { setBusy(false); }
  }

  async function test() {
    if (!workspace) return;
    setBusy(true);
    try { await testConnection({ data: { organizationId: workspace.id } }); await load(); toast.success("Conexão validada com a Meta."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao testar a conexão."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!workspace || !window.confirm("Desconectar esta conta do WhatsApp? As conversas existentes serão preservadas.")) return;
    setBusy(true);
    try { await disconnect({ data: { organizationId: workspace.id } }); setAccount(null); toast.success("WhatsApp desconectado."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao desconectar."); }
    finally { setBusy(false); }
  }

  const connected = account?.status === "conectado";
  return <AppShell title="WhatsApp" subtitle="Conecte sua conta oficial do WhatsApp Business Cloud.">
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <Card><CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center"><span className={`grid size-12 shrink-0 place-items-center rounded-full ${connected ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}><MessageCircle /></span><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{connected ? "WhatsApp conectado" : "WhatsApp não conectado"}</h2><Badge variant="outline">{connected ? "Ativo" : "Configuração necessária"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{connected ? "Seu WhatsApp está pronto para receber e enviar mensagens reais." : "Conecte sua conta do WhatsApp Business para receber e gerenciar mensagens no Fenixbot."}</p></div>{connected && <CheckCircle2 className="size-5 text-success" />}</CardContent></Card>
        {loading ? <div className="h-80 animate-pulse rounded-md bg-muted" /> : loadError ? <LoadError message={loadError} onRetry={() => void load()} /> : connected ? <Card><CardHeader><CardTitle>Dados da conexão</CardTitle></CardHeader><CardContent className="space-y-4"><dl className="grid gap-4 sm:grid-cols-2"><Info label="Nome comercial" value={account.business_name || "Não informado"} /><Info label="Telefone" value={account.display_phone_number || "Não informado"} /><Info label="WABA ID" value={account.waba_id} /><Info label="Phone Number ID" value={account.phone_number_id} />{account.last_error && <div className="sm:col-span-2"><Info label="Aviso da Meta" value={account.last_error} /></div>}<Info label="Última sincronização" value={account.last_sync_at ? new Date(account.last_sync_at).toLocaleString("pt-BR") : "Ainda não sincronizado"} /></dl>{canManage && <div className="flex flex-wrap gap-2 border-t pt-5"><Button type="button" onClick={() => void test()} disabled={busy}><RefreshCw />Testar conexão</Button><Button type="button" variant="outline" onClick={() => void remove()} disabled={busy}><Unplug />Desconectar WhatsApp</Button></div>}</CardContent></Card> : <Card><CardHeader><CardTitle>Conectar conta da Meta</CardTitle></CardHeader><CardContent>{!canManage ? <p className="text-sm text-muted-foreground">Somente administradores e gerentes podem configurar esta integração.</p> : <div className="space-y-5">{embeddedSignup && <div className="space-y-3"><p className="text-sm text-muted-foreground">Entre com sua conta do Facebook, escolha a empresa e o número de WhatsApp. A conexão é feita automaticamente.</p><Button type="button" onClick={() => void connectWithMeta()} disabled={busy}><MessageCircle />{busy ? "Conectando..." : "Conectar com a Meta"}</Button></div>}{(manualAvailable || !embeddedSignup) && <details open={!embeddedSignup} className="rounded-md border p-4"><summary className="cursor-pointer text-sm font-medium">Conexão manual (avançado)</summary><form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2"><div><Label htmlFor="waba_id">WABA ID</Label><Input id="waba_id" name="waba_id" minLength={4} required className="mt-2" placeholder="ID da conta comercial" /></div><div><Label htmlFor="phone_number_id">Phone Number ID</Label><Input id="phone_number_id" name="phone_number_id" minLength={4} required className="mt-2" placeholder="ID do número" /></div><div className="sm:col-span-2"><Label htmlFor="app_id">App ID</Label><Input id="app_id" name="app_id" minLength={4} required className="mt-2" placeholder="ID do aplicativo na Meta" /></div><div className="sm:col-span-2"><Button disabled={busy || !credentialsConfigured}><Wifi />{busy ? "Validando..." : "Conectar WhatsApp"}</Button>{!credentialsConfigured && <p className="mt-3 text-xs text-warning">As credenciais seguras da Meta ainda precisam ser adicionadas para liberar a conexão.</p>}</div></form></details>}</div>}</CardContent></Card>}
      </div>
      <aside className="space-y-4"><Card><CardHeader><CardTitle>Webhook da Meta</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Use esta rota na configuração do aplicativo Meta após publicar o Fenixbot:</p><code className="mt-3 block break-all rounded-md bg-muted p-3 text-xs">{origin}/api/public/webhooks/whatsapp</code><p className="mt-3 text-xs text-muted-foreground">Assine o campo <strong>messages</strong> da conta do WhatsApp Business.</p></CardContent></Card><Card><CardContent className="flex gap-3 p-4"><ShieldCheck className="size-5 shrink-0 text-success" /><p className="text-xs leading-relaxed text-muted-foreground">Access Token, App Secret e token de verificação ficam protegidos no servidor e nunca aparecem nesta página.</p></CardContent></Card><a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary">Documentação oficial da Meta <ExternalLink className="size-4" /></a></aside>
    </div>
  </AppShell>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-all text-sm font-medium">{value}</dd></div>; }