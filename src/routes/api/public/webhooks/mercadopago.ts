import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/mercadopago")({
  server: { handlers: {
    POST: async ({ request }) => {
      const url = new URL(request.url);
      const raw = await request.text();
      let body: { type?: string; data?: { id?: string | number } } = {};
      try { body = JSON.parse(raw); } catch { /* alguns avisos chegam só pela URL */ }
      const type = body.type ?? url.searchParams.get("type") ?? "";
      const dataId = url.searchParams.get("data.id") ?? (body.data?.id == null ? "" : String(body.data.id));
      if (!dataId) return new Response("Ignorado");
      const { mercadoPagoConfigured, verifyMercadoPagoSignature, handleMercadoPagoNotification } = await import("@/lib/billing/mercadopago.server");
      if (!mercadoPagoConfigured()) return new Response("Não configurado", { status: 503 });
      if (!verifyMercadoPagoSignature(request, dataId)) return new Response("Assinatura inválida", { status: 401 });
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      try {
        await handleMercadoPagoNotification(supabaseAdmin, type, dataId);
      } catch (error) {
        console.error("Aviso do Mercado Pago falhou", error instanceof Error ? error.message : error);
        return new Response("Erro temporário", { status: 500 });
      }
      return new Response("OK");
    },
  } },
});
