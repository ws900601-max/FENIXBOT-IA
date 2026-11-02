import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/webhooks/whatsapp")({
  server: { handlers: {
    GET: async ({ request }) => (await import("@/lib/whatsapp/webhook.server")).handleWhatsAppVerification(request),
    POST: async ({ request }) => (await import("@/lib/whatsapp/webhook.server")).handleWhatsAppEvent(request),
  } },
});