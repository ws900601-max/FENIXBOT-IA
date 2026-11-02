import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const orgInput = z.object({ organizationId: z.string().uuid() });

async function requireManager(context: { supabase: any; userId: string }, organizationId: string) {
  const { data: allowed } = await context.supabase.rpc("has_org_role", { _organization_id: organizationId, _roles: ["administrador", "gerente"], _user_id: context.userId });
  if (!allowed) throw new Error("Somente administradores e gerentes podem configurar o Instagram.");
}

export const getInstagramSetup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((i) => orgInput.parse(i)).handler(async ({ data, context }) => {
  const { data: account } = await context.supabase.from("instagram_accounts").select("id,ig_user_id,username,status,last_error,last_sync_at,connected_at,token_expires_at").eq("organization_id", data.organizationId).maybeSingle();
  const { instagramSecretsConfigured } = await import("./instagram.server");
  return { account, credentialsConfigured: instagramSecretsConfigured() };
});

export const startInstagramConnect = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((i) => orgInput.extend({ origin: z.string().url() }).parse(i)).handler(async ({ data, context }) => {
  await requireManager(context, data.organizationId);
  const { instagramSecretsConfigured, buildAuthorizeUrl } = await import("./instagram.server");
  if (!instagramSecretsConfigured()) throw new Error("Adicione as credenciais do app da Meta antes de conectar.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { assertCanConnectChannel } = await import("@/lib/billing/entitlements.server");
  const { data: existing } = await supabaseAdmin.from("instagram_accounts").select("id").eq("organization_id", data.organizationId).maybeSingle();
  await assertCanConnectChannel(supabaseAdmin, data.organizationId, Boolean(existing));
  const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  await supabaseAdmin.from("instagram_oauth_states").insert({ state, organization_id: data.organizationId, user_id: context.userId });
  return { url: buildAuthorizeUrl(`${new URL(data.origin).origin}/api/public/instagram/callback`, state) };
});

export const testInstagramConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((i) => orgInput.parse(i)).handler(async ({ data, context }) => {
  await requireManager(context, data.organizationId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getAccountToken, inspectAccount, markAttention } = await import("./instagram.server");
  const { token, accountId } = await getAccountToken(supabaseAdmin, data.organizationId);
  try {
    const me = await inspectAccount(token);
    await supabaseAdmin.from("instagram_accounts").update({ username: me.username, status: "conectado", last_error: null, last_sync_at: new Date().toISOString() }).eq("id", accountId);
    return { ok: true, username: me.username };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao validar a conta.";
    await markAttention(supabaseAdmin, accountId, msg);
    throw new Error(msg);
  }
});

export const disconnectInstagram = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((i) => orgInput.parse(i)).handler(async ({ data, context }) => {
  await requireManager(context, data.organizationId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("instagram_accounts").delete().eq("organization_id", data.organizationId);
  return { ok: true };
});

export const sendConversationInstagramMessage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((i) => z.object({ conversationId: z.string().uuid(), body: z.string().trim().min(1).max(1000) }).parse(i)).handler(async ({ data, context }) => {
  const { data: conv } = await context.supabase.from("conversations").select("id,organization_id,channel,contacts(instagram_id)").eq("id", data.conversationId).single();
  if (!conv) throw new Error("Conversa não encontrada.");
  if (conv.channel !== "instagram") throw new Error("Esta conversa não veio do Instagram.");
  const recipient = (conv.contacts as { instagram_id: string | null } | null)?.instagram_id;
  if (!recipient) throw new Error("O contato não possui identificação do Instagram.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getAccountToken, sendInstagramText, markAttention } = await import("./instagram.server");
  const { token, accountId } = await getAccountToken(supabaseAdmin, conv.organization_id);
  let sent;
  try { sent = await sendInstagramText(token, recipient, data.body); } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao enviar.";
    if (/token|session|OAuth/i.test(msg)) await markAttention(supabaseAdmin, accountId, msg);
    throw new Error(`O Instagram recusou o envio: ${msg}`);
  }
  const { data: message, error } = await supabaseAdmin.from("messages").insert({ organization_id: conv.organization_id, conversation_id: conv.id, sender: "atendente", body: data.body, external_message_id: sent.externalId, delivery_status: "sent" }).select("id,sender,body,sent_at,delivery_status").single();
  if (error || !message) throw new Error("A mensagem foi enviada, mas não pôde ser registrada.");
  await context.supabase.from("conversations").update({ last_message: data.body, last_message_at: message.sent_at, handled_by_ai: false, unread_count: 0, updated_at: new Date().toISOString() }).eq("id", conv.id);
  return message;
});
