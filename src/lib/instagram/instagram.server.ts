import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { runInBackground } from "@/lib/background.server";

const GRAPH = "https://graph.instagram.com/v23.0";
type AdminClient = SupabaseClient<Database>;

export function instagramSecretsConfigured() {
  return Boolean(process.env["INSTAGRAM_APP_ID"] && process.env["INSTAGRAM_APP_SECRET"] && process.env["INSTAGRAM_WEBHOOK_VERIFY_TOKEN"]);
}

function secret(name: "INSTAGRAM_APP_ID" | "INSTAGRAM_APP_SECRET") {
  const v = process.env[name];
  if (!v) throw new Error("As credenciais do app da Meta para o Instagram ainda não foram adicionadas.");
  return v;
}

export function verifyInstagramToken(token: string) {
  const expected = process.env["INSTAGRAM_WEBHOOK_VERIFY_TOKEN"];
  return !!expected && token.length > 0 && token === expected;
}

export function verifyInstagramSignature(rawBody: string, signature: string | null) {
  if (!signature?.startsWith("sha256=")) return false;
  const received = Buffer.from(signature.slice(7), "hex");
  const expected = Buffer.from(createHmac("sha256", secret("INSTAGRAM_APP_SECRET")).update(rawBody).digest("hex"), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function buildAuthorizeUrl(redirectUri: string, state: string) {
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.searchParams.set("client_id", secret("INSTAGRAM_APP_ID"));
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_messages");
  u.searchParams.set("state", state);
  return u.toString();
}

async function readJson(res: Response) {
  const text = await res.text();
  let body: any = {};
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok || body.error) throw new Error(body.error?.message || body.error_message || `Erro da Meta (${res.status}).`);
  return body;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const form = new URLSearchParams({ client_id: secret("INSTAGRAM_APP_ID"), client_secret: secret("INSTAGRAM_APP_SECRET"), grant_type: "authorization_code", redirect_uri: redirectUri, code });
  const short = await readJson(await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form }));
  const long = await readJson(await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(secret("INSTAGRAM_APP_SECRET"))}&access_token=${encodeURIComponent(short.access_token)}`));
  const me = await inspectAccount(long.access_token);
  return { accessToken: long.access_token as string, expiresAt: new Date(Date.now() + Number(long.expires_in ?? 5184000) * 1000).toISOString(), ...me };
}

export async function inspectAccount(token: string) {
  const me = await readJson(await fetch(`${GRAPH}/me?fields=user_id,username`, { headers: { Authorization: `Bearer ${token}` } }));
  return { igUserId: String(me.user_id), username: (me.username as string) ?? null };
}

export async function subscribeWebhooks(token: string) {
  await readJson(await fetch(`${GRAPH}/me/subscribed_apps?subscribed_fields=messages`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }));
}

export async function sendInstagramText(token: string, recipientId: string, text: string) {
  const body = await readJson(await fetch(`${GRAPH}/me/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }) }));
  if (!body.message_id) throw new Error("A Meta não confirmou o envio da mensagem.");
  return { externalId: body.message_id as string };
}

const REFRESH_BEFORE_MS = 10 * 86_400_000;
const REPLY_DEBOUNCE_MS = Number(process.env["INSTAGRAM_REPLY_DEBOUNCE_MS"] ?? 3000);

export async function getAccountToken(admin: AdminClient, organizationId: string) {
  const { data: account } = await admin.from("instagram_accounts").select("id,status,token_expires_at").eq("organization_id", organizationId).maybeSingle();
  if (!account || account.status === "desconectado") throw new Error("Conecte o Instagram antes de enviar.");
  const { data: tok } = await admin.from("instagram_tokens").select("access_token").eq("account_id", account.id).maybeSingle();
  if (!tok) throw new Error("A conexão do Instagram precisa ser refeita.");
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : null;
  // O token longo do Instagram vale 60 dias; renova sozinho quando faltam menos de 10 dias.
  if (expiresAt && expiresAt > Date.now() && expiresAt - Date.now() < REFRESH_BEFORE_MS) {
    try {
      const refreshed = await readJson(await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(tok.access_token)}`));
      const newExpiry = new Date(Date.now() + Number(refreshed.expires_in ?? 5184000) * 1000).toISOString();
      await admin.from("instagram_tokens").update({ access_token: refreshed.access_token, updated_at: new Date().toISOString() }).eq("account_id", account.id);
      await admin.from("instagram_accounts").update({ token_expires_at: newExpiry, updated_at: new Date().toISOString() }).eq("id", account.id);
      return { accountId: account.id, token: refreshed.access_token as string };
    } catch (e) {
      console.error("Renovação do token do Instagram falhou", e instanceof Error ? e.message : e);
    }
  }
  return { accountId: account.id, token: tok.access_token };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function markAttention(admin: AdminClient, accountId: string, message: string) {
  await admin.from("instagram_accounts").update({ status: "atencao", last_error: message, updated_at: new Date().toISOString() }).eq("id", accountId);
}

type IgEvent = { sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean } };
export type InstagramWebhookPayload = { object?: string; entry?: { id?: string; messaging?: IgEvent[] }[] };

export async function processInstagramEvent(admin: AdminClient, payload: InstagramWebhookPayload) {
  for (const entry of payload.entry ?? []) {
    const igId = entry.id;
    if (!igId) continue;
    const { data: account } = await admin.from("instagram_accounts").select("id,organization_id,status").eq("ig_user_id", igId).maybeSingle();
    if (!account || account.status === "desconectado") continue;
    await admin.from("instagram_accounts").update({ last_sync_at: new Date().toISOString() }).eq("id", account.id);
    for (const ev of entry.messaging ?? []) {
      const msg = ev.message;
      const senderId = ev.sender?.id;
      if (!msg?.mid || !msg.text || msg.is_echo || !senderId || senderId === igId) continue;
      const { data: dup } = await admin.from("messages").select("id").eq("external_message_id", msg.mid).maybeSingle();
      if (dup) continue;
      const orgId = account.organization_id;
      const sentAt = new Date(ev.timestamp ?? Date.now()).toISOString();
      let { data: contact } = await admin.from("contacts").select("id,name,stage").eq("organization_id", orgId).eq("instagram_id", senderId).maybeSingle();
      if (!contact) {
        let name = `Instagram ${senderId.slice(-4)}`;
        try {
          const { token } = await getAccountToken(admin, orgId);
          const prof = await readJson(await fetch(`${GRAPH}/${senderId}?fields=username,name`, { headers: { Authorization: `Bearer ${token}` } }));
          name = prof.name || (prof.username ? `@${prof.username}` : name);
        } catch { /* perfil indisponível: mantém nome padrão */ }
        const { data: created } = await admin.from("contacts").insert({ organization_id: orgId, name, phone: `ig:${senderId}`, instagram_id: senderId, source: "Instagram", stage: "novo", last_interaction_at: sentAt }).select("id,name,stage").single();
        contact = created;
      } else {
        await admin.from("contacts").update({ last_interaction_at: sentAt }).eq("id", contact.id);
      }
      if (!contact) continue;
      let { data: conv } = await admin.from("conversations").select("id,handled_by_ai,unread_count").eq("organization_id", orgId).eq("contact_id", contact.id).eq("channel", "instagram").neq("status", "encerrada").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!conv) {
        const { data: created } = await admin.from("conversations").insert({ organization_id: orgId, contact_id: contact.id, channel: "instagram", handled_by_ai: true, last_message: msg.text, last_message_at: sentAt, unread_count: 1 }).select("id,handled_by_ai,unread_count").single();
        conv = created;
      } else {
        await admin.from("conversations").update({ last_message: msg.text, last_message_at: sentAt, unread_count: (conv.unread_count ?? 0) + 1, status: "aberta", updated_at: new Date().toISOString() }).eq("id", conv.id);
      }
      if (!conv) continue;
      const { data: saved, error: insErr } = await admin.from("messages").insert({ organization_id: orgId, conversation_id: conv.id, sender: "cliente", body: msg.text, sent_at: sentAt, external_message_id: msg.mid, delivery_status: "delivered" }).select("id").single();
      if (insErr || !saved) continue;
      const replyArgs = [orgId, conv.id, contact.id, contact.name, contact.stage, senderId] as const;
      const messageId = saved.id;
      if (conv.handled_by_ai) await runInBackground(async () => {
        // Espera o cliente terminar de digitar; só a última mensagem da sequência dispara a resposta.
        if (REPLY_DEBOUNCE_MS > 0) await sleep(REPLY_DEBOUNCE_MS);
        const [{ data: latest }, { data: current }] = await Promise.all([
          admin.from("messages").select("id").eq("conversation_id", replyArgs[1]).eq("sender", "cliente").order("sent_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
          admin.from("conversations").select("handled_by_ai").eq("id", replyArgs[1]).single(),
        ]);
        if (latest?.id !== messageId || !current?.handled_by_ai) return;
        await autoReply(admin, ...replyArgs);
      });
    }
  }
}

async function autoReply(admin: AdminClient, orgId: string, convId: string, contactId: string, contactName: string, stage: string, recipientId: string) {
  const { loadAgentSetup, toModelHistory, applyAgentStage } = await import("@/lib/ai/agent-context.server");
  const setup = await loadAgentSetup(admin, orgId, { name: contactName, stage }, "instagram");
  if (!setup?.config.enabled || !setup.config.auto_reply_instagram || !setup.organization) return;
  const { config, organization: org, context } = setup;
  const { data: rows } = await admin.from("messages").select("sender,body").eq("conversation_id", convId).order("sent_at", { ascending: false }).limit(config.history_limit);
  if (!rows?.length) return;
  const { generateAgentReply, AI_MODEL } = await import("@/lib/ai/agent.server");
  const { assertCanUseAI, PlanLimitError } = await import("@/lib/billing/entitlements.server");
  try {
    await assertCanUseAI(admin, orgId);
  } catch (error) {
    if (!(error instanceof PlanLimitError)) throw error;
    await admin.from("conversations").update({ handled_by_ai: false, updated_at: new Date().toISOString() }).eq("id", convId);
    await admin.from("ai_usage_events").insert({ organization_id: orgId, conversation_id: convId, model: AI_MODEL, requested_by: org.created_by, status: "erro", error_code: "limite_plano" });
    return;
  }
  const started = Date.now();
  try {
    const g = await generateAgentReply({ context, history: toModelHistory([...rows].reverse()) });
    const { token, accountId } = await getAccountToken(admin, orgId);
    let sent;
    try { sent = await sendInstagramText(token, recipientId, g.text); } catch (e) { await markAttention(admin, accountId, e instanceof Error ? e.message : "Falha ao enviar"); throw e; }
    const { data: m } = await admin.from("messages").insert({ organization_id: orgId, conversation_id: convId, sender: "ia", body: g.text, external_message_id: sent.externalId, delivery_status: "sent" }).select("sent_at").single();
    await admin.from("conversations").update({ last_message: g.text, last_message_at: m?.sent_at ?? new Date().toISOString(), unread_count: 0, ...(g.handoff ? { handled_by_ai: false } : {}) }).eq("id", convId);
    await applyAgentStage(admin, contactId, g.stage);
    await admin.from("ai_usage_events").insert({ organization_id: orgId, conversation_id: convId, model: AI_MODEL, input_tokens: g.usage.inputTokens ?? 0, output_tokens: g.usage.outputTokens ?? 0, total_tokens: g.usage.totalTokens ?? 0, requested_by: org.created_by, duration_ms: Date.now() - started, status: "sucesso", error_code: g.handoff ? "transferido_humano" : null });
  } catch (e) {
    console.error("Resposta automática do Instagram falhou", e instanceof Error ? e.message : e);
    await admin.from("ai_usage_events").insert({ organization_id: orgId, conversation_id: convId, model: AI_MODEL, requested_by: org.created_by, duration_ms: Date.now() - started, status: "erro", error_code: "instagram_auto_reply" });
  }
}
