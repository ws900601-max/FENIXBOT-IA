import { createFileRoute } from "@tanstack/react-router";

function back(origin: string, status: string, message?: string) {
  const u = new URL("/instagram", origin);
  u.searchParams.set("status", status);
  if (message) u.searchParams.set("message", message.slice(0, 200));
  return Response.redirect(u.toString(), 302);
}

export const Route = createFileRoute("/api/public/instagram/callback")({
  server: { handlers: {
    GET: async ({ request }) => {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (url.searchParams.get("error")) return back(url.origin, "erro", "A autorização foi cancelada no Instagram.");
      if (!code || !state) return back(url.origin, "erro", "Resposta incompleta da Meta.");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: saved } = await supabaseAdmin.from("instagram_oauth_states").delete().eq("state", state).select("organization_id,created_at").maybeSingle();
      if (!saved || Date.now() - new Date(saved.created_at).getTime() > 15 * 60_000) return back(url.origin, "erro", "O pedido de conexão expirou. Tente novamente.");
      try {
        const { exchangeCode, subscribeWebhooks } = await import("@/lib/instagram/instagram.server");
        const r = await exchangeCode(code, `${url.origin}/api/public/instagram/callback`);
        let lastError: string | null = null;
        try { await subscribeWebhooks(r.accessToken); } catch (e) { lastError = `Mensagens ainda não assinadas: ${e instanceof Error ? e.message : ""}`; }
        const now = new Date().toISOString();
        const { data: acc, error } = await supabaseAdmin.from("instagram_accounts").upsert({ organization_id: saved.organization_id, ig_user_id: r.igUserId, username: r.username, status: lastError ? "atencao" : "conectado", last_error: lastError, connected_at: now, last_sync_at: now, token_expires_at: r.expiresAt, updated_at: now }, { onConflict: "organization_id" }).select("id").single();
        if (error || !acc) return back(url.origin, "erro", "Esta conta do Instagram já está ligada a outra empresa.");
        await supabaseAdmin.from("instagram_tokens").upsert({ account_id: acc.id, access_token: r.accessToken, updated_at: now });
        return back(url.origin, "ok");
      } catch (e) {
        return back(url.origin, "erro", e instanceof Error ? e.message : "Falha ao conectar.");
      }
    },
  } },
});
