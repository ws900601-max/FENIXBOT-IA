import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const accountSchema = z.object({ organizationId: z.string().uuid(), wabaId: z.string().min(4).max(128), phoneNumberId: z.string().min(4).max(128), appId: z.string().min(4).max(128) });
const embeddedSignupSchema = z.object({ organizationId: z.string().uuid(), code: z.string().min(10).max(2048), wabaId: z.string().min(4).max(128), phoneNumberId: z.string().min(4).max(128) });
const ACCOUNT_FIELDS = "id,waba_id,phone_number_id,app_id,business_name,display_phone_number,status,last_error,last_sync_at,connected_at";
const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

// A conexão manual usa o token global do app da Meta, que enxerga todos os números dele.
// Por isso só os donos da plataforma (PLATFORM_ADMIN_EMAILS) podem usá-la; clientes usam o cadastro integrado.
function canUseManualConnection(claims: Record<string, unknown>) {
  const allowed = (process.env["PLATFORM_ADMIN_EMAILS"] ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  const email = typeof claims["email"] === "string" ? claims["email"].toLowerCase() : "";
  return Boolean(process.env["WHATSAPP_ACCESS_TOKEN"]) && allowed.includes(email);
}

async function requireManager(context: { supabase: any; userId: string }, organizationId: string) {
  const { data: allowed } = await context.supabase.rpc("has_org_role", { _organization_id: organizationId, _roles: ["administrador", "gerente"], _user_id: context.userId });
  if (!allowed) throw new Error("Somente administradores e gerentes podem configurar o WhatsApp.");
}

export const getWhatsAppSetup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input) => z.object({ organizationId: z.string().uuid() }).parse(input)).handler(async ({ data, context }) => {
  const { data: account } = await context.supabase.from("whatsapp_accounts").select(ACCOUNT_FIELDS).eq("organization_id", data.organizationId).maybeSingle();
  const { whatsappSecretsConfigured, embeddedSignupConfig } = await import("./whatsapp.server");
  return { account, credentialsConfigured: whatsappSecretsConfigured(), manualConnectionAvailable: canUseManualConnection(context.claims), embeddedSignup: embeddedSignupConfig() };
});

export const connectWhatsApp = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input) => accountSchema.parse(input)).handler(async ({ data, context }) => {
  await requireManager(context, data.organizationId);
  if (!canUseManualConnection(context.claims)) throw new Error("Use o botão \"Conectar com a Meta\" para ligar o seu número.");
  const { whatsappSecretsConfigured, inspectWhatsAppNumber, globalAccessToken } = await import("./whatsapp.server");
  if (!whatsappSecretsConfigured()) throw new Error("Adicione as credenciais seguras da Meta antes de conectar.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { assertCanConnectChannel } = await import("@/lib/billing/entitlements.server");
  const { data: existing } = await supabaseAdmin.from("whatsapp_accounts").select("id").eq("organization_id", data.organizationId).maybeSingle();
  await assertCanConnectChannel(supabaseAdmin, data.organizationId, Boolean(existing));
  const details = await inspectWhatsAppNumber(globalAccessToken(), data.phoneNumberId);
  const now = new Date().toISOString();
  const { data: account, error } = await supabaseAdmin.from("whatsapp_accounts").upsert({ organization_id: data.organizationId, waba_id: data.wabaId, phone_number_id: data.phoneNumberId, app_id: data.appId, business_name: details.businessName, display_phone_number: details.phoneNumber, status: "conectado", last_error: null, last_sync_at: now, connected_at: now, updated_at: now }, { onConflict: "organization_id" }).select(ACCOUNT_FIELDS).single();
  if (error) throw new Error(error.code === "23505" ? "Este número já está conectado a outra empresa no Fenixbot." : "Não foi possível salvar a conexão do WhatsApp.");
  return account;
});

// Conexão em poucos cliques: o cliente faz login na Meta e escolhe o número dentro do Fenixbot.
export const completeWhatsAppEmbeddedSignup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input) => embeddedSignupSchema.parse(input)).handler(async ({ data, context }) => {
  await requireManager(context, data.organizationId);
  const server = await import("./whatsapp.server");
  const config = server.embeddedSignupConfig();
  if (!config) throw new Error("O cadastro integrado da Meta ainda não foi configurado.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { assertCanConnectChannel } = await import("@/lib/billing/entitlements.server");
  const { data: existing } = await supabaseAdmin.from("whatsapp_accounts").select("id").eq("organization_id", data.organizationId).maybeSingle();
  await assertCanConnectChannel(supabaseAdmin, data.organizationId, Boolean(existing));
  const accessToken = await server.exchangeEmbeddedSignupCode(data.code);
  await server.subscribeAppToWaba(accessToken, data.wabaId);
  let registrationWarning: string | null = null;
  // O registro define o PIN da verificação em duas etapas do número; ele é guardado para futuros registros.
  const pin = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 900000));
  let pinSaved = true;
  try {
    // Números novos precisam ser registrados na Cloud API; números já registrados retornam erro e seguem funcionando.
    await server.registerPhoneNumber(accessToken, data.phoneNumberId, pin);
  } catch (error) {
    pinSaved = false;
    registrationWarning = error instanceof Error ? error.message : "Registro do número não confirmado.";
  }
  const details = await server.inspectWhatsAppNumber(accessToken, data.phoneNumberId);
  const now = new Date().toISOString();
  const { data: account, error } = await supabaseAdmin.from("whatsapp_accounts").upsert({ organization_id: data.organizationId, waba_id: data.wabaId, phone_number_id: data.phoneNumberId, app_id: config.appId, business_name: details.businessName, display_phone_number: details.phoneNumber, status: "conectado", last_error: registrationWarning, last_sync_at: now, connected_at: now, updated_at: now }, { onConflict: "organization_id" }).select(ACCOUNT_FIELDS).single();
  if (error || !account) throw new Error(error?.code === "23505" ? "Este número já está conectado a outra empresa no Fenixbot." : "Não foi possível salvar a conexão do WhatsApp.");
  const { error: tokenError } = await supabaseAdmin.from("whatsapp_tokens").upsert({ account_id: account.id, access_token: accessToken, ...(pinSaved ? { registration_pin: pin } : {}), updated_at: now });
  if (tokenError) throw new Error("Não foi possível guardar o acesso do WhatsApp com segurança.");
  return account;
});

export const testWhatsAppConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input) => z.object({ organizationId: z.string().uuid() }).parse(input)).handler(async ({ data, context }) => {
  await requireManager(context, data.organizationId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: account } = await supabaseAdmin.from("whatsapp_accounts").select("id,phone_number_id").eq("organization_id", data.organizationId).maybeSingle();
  if (!account) throw new Error("WhatsApp ainda não conectado.");
  const { inspectWhatsAppNumber, getAccountAccessToken } = await import("./whatsapp.server");
  const details = await inspectWhatsAppNumber(await getAccountAccessToken(supabaseAdmin, account.id), account.phone_number_id);
  const now = new Date().toISOString();
  await supabaseAdmin.from("whatsapp_accounts").update({ business_name: details.businessName, display_phone_number: details.phoneNumber, status: "conectado", last_error: null, last_sync_at: now, updated_at: now }).eq("id", account.id);
  return { ok: true, ...details, lastSyncAt: now };
});

export const disconnectWhatsApp = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input) => z.object({ organizationId: z.string().uuid() }).parse(input)).handler(async ({ data, context }) => {
  await requireManager(context, data.organizationId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("whatsapp_accounts").delete().eq("organization_id", data.organizationId);
  if (error) throw new Error("Não foi possível desconectar o WhatsApp.");
  return { ok: true };
});

export const sendConversationWhatsAppMessage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input) => z.object({ conversationId: z.string().uuid(), body: z.string().trim().min(1).max(4096) }).parse(input)).handler(async ({ data, context }) => {
  const { data: conversation } = await context.supabase.from("conversations").select("id,organization_id,channel,contacts(phone)").eq("id", data.conversationId).single();
  if (!conversation) throw new Error("Conversa não encontrada.");
  if (conversation.channel !== "whatsapp") throw new Error("Esta conversa não está conectada ao WhatsApp.");
  const phone = conversation.contacts?.phone;
  if (!phone) throw new Error("O contato não possui telefone válido.");
  const { data: account } = await context.supabase.from("whatsapp_accounts").select("id,phone_number_id,status").eq("organization_id", conversation.organization_id).single();
  if (!account || account.status !== "conectado") throw new Error("Conecte o WhatsApp antes de enviar.");
  const { data: lastFromClient } = await context.supabase.from("messages").select("sent_at").eq("conversation_id", conversation.id).eq("sender", "cliente").order("sent_at", { ascending: false }).limit(1).maybeSingle();
  if (!lastFromClient || Date.now() - new Date(lastFromClient.sent_at).getTime() > CUSTOMER_SERVICE_WINDOW_MS) throw new Error("Já se passaram mais de 24 horas desde a última mensagem do cliente. Pela regra da Meta, só é possível retomar a conversa quando o cliente escrever de novo ou com um modelo aprovado.");
  const { sendWhatsAppText, getAccountAccessToken } = await import("./whatsapp.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sent = await sendWhatsAppText(await getAccountAccessToken(supabaseAdmin, account.id), account.phone_number_id, phone, data.body);
  const { data: message, error } = await supabaseAdmin.from("messages").insert({ organization_id: conversation.organization_id, conversation_id: conversation.id, sender: "atendente", body: data.body, external_message_id: sent.externalId, delivery_status: "sent" }).select("id,sender,body,sent_at,delivery_status").single();
  if (error || !message) throw new Error("A mensagem foi enviada, mas não pôde ser registrada.");
  await context.supabase.from("conversations").update({ last_message: data.body, last_message_at: message.sent_at, handled_by_ai: false, unread_count: 0, updated_at: new Date().toISOString() }).eq("id", conversation.id);
  await supabaseAdmin.from("whatsapp_message_status").insert({ organization_id: conversation.organization_id, message_id: message.id, external_message_id: sent.externalId, status: "sent", occurred_at: message.sent_at });
  return message;
});
