import { z } from "zod";
import type { MetaWebhookPayload } from "./whatsapp.server";

const webhookSchema = z.object({ object: z.string().optional(), entry: z.array(z.unknown()).optional() }).passthrough();

export async function handleWhatsAppVerification(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const { verifyWebhookToken } = await import("./whatsapp.server");
  if (mode === "subscribe" && verifyWebhookToken(token)) return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  return new Response("Verificação inválida", { status: 403 });
}

export async function handleWhatsAppEvent(request: Request) {
  const rawBody = await request.text();
  const { verifyMetaSignature, processWhatsAppEvent } = await import("./whatsapp.server");
  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) return new Response("Assinatura inválida", { status: 401 });
  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { return new Response("JSON inválido", { status: 400 }); }
  const validated = webhookSchema.safeParse(parsed);
  if (!validated.success) return new Response("Evento inválido", { status: 400 });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await processWhatsAppEvent(supabaseAdmin, validated.data as MetaWebhookPayload);
  return new Response("EVENT_RECEIVED", { status: 200 });
}