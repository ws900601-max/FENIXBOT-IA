import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { runInBackground } from "@/lib/background.server";
import { transcribeAudio } from "@/lib/ai/provider.server";

const GRAPH_VERSION = "v23.0";
const graphUrl = (path: string) => `https://graph.facebook.com/${process.env['WHATSAPP_GRAPH_API_VERSION'] || GRAPH_VERSION}/${path}`;
// Aguarda o cliente terminar de digitar mensagens em sequência antes de a IA responder uma única vez.
const REPLY_DEBOUNCE_MS = Number(process.env['WHATSAPP_REPLY_DEBOUNCE_MS'] ?? 3000);
const TRANSCRIBING_BODY = "🎤 Áudio recebido (transcrevendo...)";

function requiredSecret(name: "WHATSAPP_APP_SECRET" | "WHATSAPP_WEBHOOK_VERIFY_TOKEN") {
  const value = process.env[name];
  if (!value) throw new Error(`Configuração ausente: ${name}`);
  return value;
}

export function embeddedSignupConfig() {
  const appId = process.env['META_APP_ID'];
  const configId = process.env['WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID'];
  return appId && configId ? { appId, configId } : null;
}

export function whatsappSecretsConfigured() {
  return Boolean(process.env['WHATSAPP_APP_SECRET'] && process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] && (process.env['WHATSAPP_ACCESS_TOKEN'] || embeddedSignupConfig()));
}

export function globalAccessToken() {
  const token = process.env['WHATSAPP_ACCESS_TOKEN'];
  if (!token) throw new Error("Configuração ausente: WHATSAPP_ACCESS_TOKEN");
  return token;
}

export function verifyWebhookToken(token: string) {
  const expected = process.env["WHATSAPP_WEBHOOK_VERIFY_TOKEN"];
  return !!expected && token.length > 0 && token === expected;
}

export function verifyMetaSignature(rawBody: string, signature: string | null) {
  if (!signature?.startsWith("sha256=")) return false;
  const received = Buffer.from(signature.slice(7), "hex");
  const expected = Buffer.from(createHmac("sha256", requiredSecret("WHATSAPP_APP_SECRET")).update(rawBody).digest("hex"), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

type AdminClient = SupabaseClient<Database>;

// Token próprio da organização (Embedded Signup) ou, na falta dele, o token global do app.
export async function getAccountAccessToken(admin: AdminClient, accountId: string) {
  const { data } = await admin.from("whatsapp_tokens").select("access_token").eq("account_id", accountId).maybeSingle();
  return data?.access_token ?? globalAccessToken();
}

type GraphError = { error?: { message?: string; code?: number; error_user_msg?: string } };

function friendlyGraphError(payload: GraphError, fallback: string) {
  const code = payload.error?.code;
  if (code === 131047) return "Já se passaram mais de 24 horas desde a última mensagem do cliente. A Meta só permite responder com um modelo aprovado.";
  if (code === 190) return "O token de acesso da Meta expirou ou foi revogado. Reconecte o WhatsApp.";
  if (code === 131026) return "Este número não pode receber mensagens do WhatsApp.";
  return payload.error?.error_user_msg || payload.error?.message || fallback;
}

async function graphJson<T>(response: Response, fallback: string) {
  const payload = await response.json().catch(() => ({})) as T & GraphError;
  if (!response.ok || payload.error) throw new Error(friendlyGraphError(payload, fallback));
  return payload;
}

export async function sendWhatsAppText(accessToken: string, phoneNumberId: string, recipient: string, body: string) {
  const response = await fetch(graphUrl(`${encodeURIComponent(phoneNumberId)}/messages`), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: recipient, type: "text", text: { preview_url: true, body } }),
  });
  const payload = await graphJson<{ messages?: { id?: string }[] }>(response, "A Meta não confirmou o envio da mensagem.");
  const externalId = payload.messages?.[0]?.id;
  if (!externalId) throw new Error("A Meta não confirmou o envio da mensagem.");
  return { externalId };
}

export async function inspectWhatsAppNumber(accessToken: string, phoneNumberId: string) {
  const response = await fetch(graphUrl(`${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await graphJson<{ display_phone_number?: string; verified_name?: string }>(response, "Não foi possível validar o número na Meta.");
  return { phoneNumber: payload.display_phone_number ?? null, businessName: payload.verified_name ?? null };
}

async function downloadMedia(accessToken: string, mediaId: string) {
  const meta = await graphJson<{ url?: string; mime_type?: string }>(await fetch(graphUrl(encodeURIComponent(mediaId)), { headers: { Authorization: `Bearer ${accessToken}` } }), "Mídia indisponível.");
  if (!meta.url) throw new Error("A Meta não retornou o endereço da mídia.");
  const file = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!file.ok) throw new Error(`Falha ao baixar a mídia (${file.status}).`);
  return { data: new Uint8Array(await file.arrayBuffer()), mimeType: meta.mime_type ?? "audio/ogg" };
}

// Embedded Signup: troca o código do login da Meta por um token da empresa cliente.
export async function exchangeEmbeddedSignupCode(code: string) {
  const config = embeddedSignupConfig();
  if (!config) throw new Error("O cadastro integrado da Meta ainda não foi configurado.");
  const url = new URL(graphUrl("oauth/access_token"));
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", requiredSecret("WHATSAPP_APP_SECRET"));
  url.searchParams.set("code", code);
  const payload = await graphJson<{ access_token?: string }>(await fetch(url), "A Meta não autorizou a conexão.");
  if (!payload.access_token) throw new Error("A Meta não retornou o token de acesso.");
  return payload.access_token;
}

export async function subscribeAppToWaba(accessToken: string, wabaId: string) {
  await graphJson(await fetch(graphUrl(`${encodeURIComponent(wabaId)}/subscribed_apps`), { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } }), "Não foi possível assinar os eventos do WhatsApp.");
}

export async function registerPhoneNumber(accessToken: string, phoneNumberId: string, pin: string) {
  await graphJson(await fetch(graphUrl(`${encodeURIComponent(phoneNumberId)}/register`), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  }), "Não foi possível registrar o número na Cloud API.");
}

type IncomingMessage = NonNullable<NonNullable<NonNullable<MetaWebhookPayload["entry"]>[number]["changes"]>[number]["value"]["messages"]>[number];

// Converte qualquer tipo de mensagem em texto legível para o inbox e para a IA.
function describeIncoming(incoming: IncomingMessage): { body: string; messageType: string; audioId?: string } | null {
  const caption = (value?: string) => value?.trim() ? `\nLegenda: ${value.trim()}` : "";
  switch (incoming.type) {
    case "text": return incoming.text?.body ? { body: incoming.text.body, messageType: "texto" } : null;
    case "audio": return { body: TRANSCRIBING_BODY, messageType: "audio", ...(incoming.audio?.id ? { audioId: incoming.audio.id } : {}) };
    case "image": return { body: `📷 [Imagem enviada pelo cliente]${caption(incoming.image?.caption)}`, messageType: "imagem" };
    case "video": return { body: `🎬 [Vídeo enviado pelo cliente]${caption(incoming.video?.caption)}`, messageType: "video" };
    case "document": return { body: `📄 [Documento enviado pelo cliente: ${incoming.document?.filename ?? "arquivo"}]${caption(incoming.document?.caption)}`, messageType: "documento" };
    case "sticker": return { body: "[Figurinha enviada pelo cliente]", messageType: "figurinha" };
    case "location": {
      const loc = incoming.location;
      const place = [loc?.name, loc?.address].filter(Boolean).join(" — ");
      return { body: `📍 [Localização enviada pelo cliente${place ? `: ${place}` : ""}${loc?.latitude != null ? ` (${loc.latitude}, ${loc.longitude})` : ""}]`, messageType: "localizacao" };
    }
    case "contacts": return { body: `👤 [Contato compartilhado: ${incoming.contacts?.map((c) => c.name?.formatted_name).filter(Boolean).join(", ") || "sem nome"}]`, messageType: "contato" };
    case "interactive": {
      const reply = incoming.interactive?.button_reply ?? incoming.interactive?.list_reply;
      return reply?.title ? { body: reply.title, messageType: "texto" } : null;
    }
    case "button": return incoming.button?.text ? { body: incoming.button.text, messageType: "texto" } : null;
    case "reaction": return null;
    default: return { body: "[O cliente enviou um tipo de mensagem que o sistema ainda não exibe]", messageType: "outro" };
  }
}

export async function processWhatsAppEvent(admin: AdminClient, payload: MetaWebhookPayload) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      const { data: account } = await admin.from("whatsapp_accounts").select("id,organization_id").eq("phone_number_id", phoneNumberId).eq("status", "conectado").maybeSingle();
      if (!account) continue;
      await admin.from("whatsapp_accounts").update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", account.id);

      for (const status of value.statuses ?? []) {
        if (!['sent', 'delivered', 'read', 'failed'].includes(status.status)) continue;
        const occurredAt = new Date(Number(status.timestamp) * 1000).toISOString();
        const { data: message } = await admin.from("messages").select("id").eq("external_message_id", status.id).maybeSingle();
        if (!message) continue;
        const error = status.errors?.[0];
        await admin.from("messages").update({ delivery_status: status.status, failure_reason: error?.title ?? null }).eq("id", message.id);
        await admin.from("whatsapp_message_status").upsert({ organization_id: account.organization_id, message_id: message.id, external_message_id: status.id, status: status.status, occurred_at: occurredAt, error_code: error?.code == null ? null : String(error.code), error_message: error?.title ?? null }, { onConflict: "external_message_id,status,occurred_at", ignoreDuplicates: true });
      }

      for (const incoming of value.messages ?? []) {
        const described = describeIncoming(incoming);
        if (!described) continue;
        const { data: duplicate } = await admin.from("messages").select("id").eq("external_message_id", incoming.id).maybeSingle();
        if (duplicate) continue;
        const phone = incoming.from;
        const name = value.contacts?.find((contact) => contact.wa_id === phone)?.profile?.name?.trim() || phone;
        const sentAt = new Date(Number(incoming.timestamp) * 1000).toISOString();
        let { data: contact } = await admin.from("contacts").select("id,name,stage").eq("organization_id", account.organization_id).eq("phone", phone).maybeSingle();
        if (contact) {
          // Só troca o nome quando ainda é o número; um nome editado pela equipe nunca é sobrescrito.
          const betterName = contact.name === phone && name !== phone ? { name } : {};
          const { data: updated } = await admin.from("contacts").update({ ...betterName, last_interaction_at: sentAt, updated_at: new Date().toISOString() }).eq("id", contact.id).select("id,name,stage").single();
          contact = updated;
        } else {
          const { data: created } = await admin.from("contacts").insert({ organization_id: account.organization_id, name, phone, source: "WhatsApp", stage: "novo", last_interaction_at: sentAt }).select("id,name,stage").single();
          contact = created;
        }
        if (!contact) continue;
        let { data: conversation } = await admin.from("conversations").select("id,handled_by_ai,unread_count").eq("organization_id", account.organization_id).eq("contact_id", contact.id).eq("channel", "whatsapp").neq("status", "encerrada").order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!conversation) {
          const { data: created } = await admin.from("conversations").insert({ organization_id: account.organization_id, contact_id: contact.id, channel: "whatsapp", handled_by_ai: true, last_message: described.body, last_message_at: sentAt, unread_count: 1 }).select("id,handled_by_ai,unread_count").single();
          conversation = created;
        } else {
          await admin.from("conversations").update({ last_message: described.body, last_message_at: sentAt, unread_count: (conversation.unread_count ?? 0) + 1, status: "aberta", updated_at: new Date().toISOString() }).eq("id", conversation.id);
        }
        if (!conversation) continue;
        // O índice único em external_message_id garante que reenvios da Meta não gerem duas respostas.
        const { data: saved, error: insertError } = await admin.from("messages").insert({ organization_id: account.organization_id, conversation_id: conversation.id, sender: "cliente", body: described.body, message_type: described.messageType, sent_at: sentAt, external_message_id: incoming.id, delivery_status: "delivered" }).select("id").single();
        if (insertError || !saved) continue;
        const job = { organizationId: account.organization_id, accountId: account.id, conversationId: conversation.id, messageId: saved.id, externalMessageId: incoming.id, contactId: contact.id, contactName: contact.name, contactStage: contact.stage, phone, phoneNumberId, audioId: described.audioId };
        await runInBackground(() => handleIncomingInBackground(admin, job));
      }
    }
  }
}

type IncomingJob = { organizationId: string; accountId: string; conversationId: string; messageId: string; externalMessageId: string; contactId: string; contactName: string; contactStage: string; phone: string; phoneNumberId: string; audioId: string | undefined };

async function handleIncomingInBackground(admin: AdminClient, job: IncomingJob) {
  if (job.audioId) {
    let body = "🎤 [Áudio enviado pelo cliente — não foi possível transcrever]";
    try {
      const token = await getAccountAccessToken(admin, job.accountId);
      const media = await downloadMedia(token, job.audioId);
      const text = await transcribeAudio(media.data, media.mimeType);
      if (text) body = `🎤 Áudio: ${text}`;
    } catch (error) {
      console.error("Transcrição de áudio falhou", error instanceof Error ? error.message : error);
    }
    await admin.from("messages").update({ body }).eq("id", job.messageId);
    await admin.from("conversations").update({ last_message: body }).eq("id", job.conversationId);
  }
  if (REPLY_DEBOUNCE_MS > 0) await sleep(REPLY_DEBOUNCE_MS);
  // Se outro áudio da sequência ainda está sendo transcrito, espera para a IA responder já sabendo o que foi dito.
  for (let attempt = 0; attempt < 8; attempt++) {
    const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", job.conversationId).eq("sender", "cliente").eq("body", TRANSCRIBING_BODY);
    if (!count) break;
    await sleep(2500);
  }
  // Só a última mensagem de uma sequência dispara a resposta, que considera todo o histórico.
  const [{ data: latest }, { data: conversation }] = await Promise.all([
    admin.from("messages").select("id").eq("conversation_id", job.conversationId).eq("sender", "cliente").order("sent_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
    admin.from("conversations").select("handled_by_ai").eq("id", job.conversationId).single(),
  ]);
  if (latest?.id !== job.messageId || !conversation?.handled_by_ai) return;
  await autoReplyToWhatsApp(admin, job);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function autoReplyToWhatsApp(admin: AdminClient, job: IncomingJob) {
  const { organizationId, conversationId } = job;
  const { loadAgentSetup, toModelHistory, applyAgentStage } = await import("@/lib/ai/agent-context.server");
  const setup = await loadAgentSetup(admin, organizationId, { name: job.contactName, stage: job.contactStage }, "whatsapp");
  if (!setup?.config.enabled || !setup.config.auto_reply_whatsapp || !setup.organization) return;
  const { config, organization, context } = setup;
  const { data: rows } = await admin.from("messages").select("sender,body").eq("organization_id", organizationId).eq("conversation_id", conversationId).order("sent_at", { ascending: false }).limit(config.history_limit);
  if (!rows?.length) return;
  const { assertCanUseAI, PlanLimitError } = await import("@/lib/billing/entitlements.server");
  const { generateAgentReply, AI_MODEL } = await import("@/lib/ai/agent.server");
  try {
    await assertCanUseAI(admin, organizationId);
  } catch (error) {
    if (!(error instanceof PlanLimitError)) throw error;
    // Sem plano ou sem tokens: a conversa fica para a equipe em vez de o cliente ficar sem resposta.
    await admin.from("conversations").update({ handled_by_ai: false, updated_at: new Date().toISOString() }).eq("id", conversationId);
    await admin.from("ai_usage_events").insert({ organization_id: organizationId, conversation_id: conversationId, requested_by: organization.created_by, model: AI_MODEL, status: "erro", error_code: "limite_plano" });
    return;
  }
  const token = await getAccountAccessToken(admin, job.accountId);
  await showTypingIndicator(token, job.phoneNumberId, job.externalMessageId);
  const startedAt = Date.now();
  try {
    const generated = await generateAgentReply({ context, history: toModelHistory([...rows].reverse()) });
    const sent = await sendWhatsAppText(token, job.phoneNumberId, job.phone, generated.text);
    const { data: message } = await admin.from("messages").insert({ organization_id: organizationId, conversation_id: conversationId, sender: "ia", body: generated.text, external_message_id: sent.externalId, delivery_status: "sent" }).select("id,sent_at").single();
    if (message) {
      await admin.from("conversations").update({ last_message: generated.text, last_message_at: message.sent_at, unread_count: 0, updated_at: new Date().toISOString(), ...(generated.handoff ? { handled_by_ai: false } : {}) }).eq("id", conversationId);
      await admin.from("whatsapp_message_status").insert({ organization_id: organizationId, message_id: message.id, external_message_id: sent.externalId, status: "sent", occurred_at: message.sent_at });
    }
    await applyAgentStage(admin, job.contactId, generated.stage);
    await admin.from("ai_usage_events").insert({ organization_id: organizationId, conversation_id: conversationId, requested_by: organization.created_by, model: AI_MODEL, status: "sucesso", input_tokens: generated.usage.inputTokens ?? null, output_tokens: generated.usage.outputTokens ?? null, total_tokens: generated.usage.totalTokens ?? null, duration_ms: Date.now() - startedAt, error_code: generated.handoff ? "transferido_humano" : null });
  } catch (error) {
    console.error("WhatsApp automatic reply failed", error instanceof Error ? error.message : error);
    await admin.from("ai_usage_events").insert({ organization_id: organizationId, conversation_id: conversationId, requested_by: organization.created_by, model: AI_MODEL, status: "erro", duration_ms: Date.now() - startedAt, error_code: "whatsapp_auto_reply" });
  }
}

// Marca como lida e mostra "digitando..." para o cliente enquanto a IA prepara a resposta.
async function showTypingIndicator(accessToken: string, phoneNumberId: string, messageId: string) {
  try {
    await fetch(graphUrl(`${encodeURIComponent(phoneNumberId)}/messages`), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId, typing_indicator: { type: "text" } }),
    });
  } catch { /* indicador é opcional */ }
}

export type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{ changes?: Array<{ value: {
    metadata?: { phone_number_id?: string };
    contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
    messages?: Array<{
      from: string; id: string; timestamp: string; type: string;
      text?: { body?: string };
      audio?: { id?: string; mime_type?: string };
      image?: { id?: string; caption?: string };
      video?: { id?: string; caption?: string };
      document?: { id?: string; caption?: string; filename?: string };
      location?: { latitude?: number; longitude?: number; name?: string; address?: string };
      contacts?: Array<{ name?: { formatted_name?: string } }>;
      interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
      button?: { text?: string };
    }>;
    statuses?: Array<{ id: string; status: string; timestamp: string; errors?: Array<{ code?: number; title?: string }> }>;
  } }> }>;
};
