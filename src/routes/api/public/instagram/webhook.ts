import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/instagram/webhook")({
  server: { handlers: {
    GET: async ({ request }) => {
      const url = new URL(request.url);
      const { verifyInstagramToken } = await import("@/lib/instagram/instagram.server");
      if (url.searchParams.get("hub.mode") === "subscribe" && verifyInstagramToken(url.searchParams.get("hub.verify_token") ?? "")) return new Response(url.searchParams.get("hub.challenge") ?? "", { headers: { "Content-Type": "text/plain" } });
      return new Response("Verificação inválida", { status: 403 });
    },
    POST: async ({ request }) => {
      const raw = await request.text();
      const { verifyInstagramSignature, processInstagramEvent, instagramSecretsConfigured } = await import("@/lib/instagram/instagram.server");
      if (!instagramSecretsConfigured()) return new Response("Não configurado", { status: 503 });
      if (!verifyInstagramSignature(raw, request.headers.get("x-hub-signature-256"))) return new Response("Assinatura inválida", { status: 401 });
      let payload: unknown;
      try { payload = JSON.parse(raw); } catch { return new Response("JSON inválido", { status: 400 }); }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      try { await processInstagramEvent(supabaseAdmin, payload as never); } catch (e) { console.error("Evento do Instagram falhou", e instanceof Error ? e.message : e); }
      return new Response("EVENT_RECEIVED");
    },
  } },
});
