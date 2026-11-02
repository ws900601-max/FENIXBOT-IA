import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { AI_MODEL, createAgentReplyStream, parseAgentOutput } from "@/lib/ai/agent.server";
import { loadAgentSetup, toModelHistory } from "@/lib/ai/agent-context.server";

const bodySchema = z.object({ conversationId: z.string().uuid() });

function safeMessage(error: unknown) {
  const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
  const message = error instanceof Error ? error.message : "Não foi possível gerar a resposta.";
  if (status === 401) return { status, message: "A integração de IA não está configurada." };
  if (status === 402) return { status, message };
  if (status === 403) return { status, message };
  if (status === 429) return { status, message: "A IA está recebendo muitas solicitações. Aguarde um pouco e tente novamente." };
  return { status: status >= 400 && status < 600 ? status : 500, message: status >= 500 ? "O serviço de IA está temporariamente indisponível." : message };
}

// Gera um RASCUNHO para a equipe revisar: nada é salvo como mensagem, enviado ao cliente
// ou muda quem conduz a conversa. Só o uso de tokens é registrado.
export const Route = createFileRoute("/api/ai/respond")({
  server: { handlers: { POST: async ({ request }) => {
    const startedAt = Date.now();
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return Response.json({ message: "Sua sessão expirou. Entre novamente." }, { status: 401 });
    try {
      const input = bodySchema.parse(await request.json());
      const url = process.env["SUPABASE_URL"];
      const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
      if (!url || !key) throw new Error("O banco de dados não está configurado.");
      const supabase = createClient<Database>(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
      const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
      const userId = claims?.claims?.sub;
      if (claimsError || !userId) return Response.json({ message: "Sua sessão expirou. Entre novamente." }, { status: 401 });
      const { data: conversation, error: conversationError } = await supabase.from("conversations").select("id,organization_id,contact_id,contacts(name,stage)").eq("id", input.conversationId).single();
      if (conversationError || !conversation) return Response.json({ message: "Conversa não encontrada." }, { status: 404 });
      const organizationId = conversation.organization_id;
      const contactStage = conversation.contacts?.stage ?? "novo";
      const [setup, { data: rows, error: historyError }] = await Promise.all([
        loadAgentSetup(supabase, organizationId, { name: conversation.contacts?.name ?? "Cliente", stage: contactStage }, "painel"),
        supabase.from("messages").select("sender,body,sent_at").eq("organization_id", organizationId).eq("conversation_id", conversation.id).order("sent_at", { ascending: false }).limit(30),
      ]);
      const config = setup?.config;
      if (!setup || !config?.enabled) return Response.json({ message: "Ative e configure a Sexta Feira antes de gerar respostas." }, { status: 409 });
      if (historyError || !rows?.length) return Response.json({ message: "A conversa precisa ter ao menos uma mensagem." }, { status: 409 });
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { assertCanUseAI, PlanLimitError } = await import("@/lib/billing/entitlements.server");
      try {
        await assertCanUseAI(supabaseAdmin, organizationId);
      } catch (error) {
        if (error instanceof PlanLimitError) return Response.json({ message: error.message }, { status: 402 });
        throw error;
      }
      const history = toModelHistory(rows.slice(0, config.history_limit).reverse());
      const agentContext = setup.context;
      const logEvent = async (fields: Partial<Database["public"]["Tables"]["ai_usage_events"]["Insert"]>) => {
        await supabaseAdmin.from("ai_usage_events").insert({ organization_id: organizationId, conversation_id: conversation.id, requested_by: userId, model: AI_MODEL, status: "sucesso", duration_ms: Date.now() - startedAt, ...fields });
      };
      const { result } = createAgentReplyStream({ context: agentContext, history, abortSignal: request.signal, onFinish: async ({ text, totalUsage }) => {
        const parsed = parseAgentOutput(text, contactStage);
        if (!parsed.text) { await logEvent({ status: "erro", error_code: "resposta_vazia" }); return; }
        await logEvent({ input_tokens: totalUsage.inputTokens ?? null, output_tokens: totalUsage.outputTokens ?? null, total_tokens: totalUsage.totalTokens ?? null, error_code: parsed.handoff ? "transferido_humano" : null });
      }, onError: async ({ error }) => {
        const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
        await logEvent({ status: "erro", error_code: status === 402 ? "creditos_insuficientes" : status === 429 ? "limite_temporario" : status >= 500 ? "servico_indisponivel" : "falha_geracao" });
      } });
      return result.toTextStreamResponse({ headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const safe = safeMessage(error);
      return Response.json({ message: safe.message }, { status: safe.status });
    }
  } } },
});