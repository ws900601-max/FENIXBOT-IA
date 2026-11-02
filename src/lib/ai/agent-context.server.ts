import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelMessage } from "ai";
import type { Database } from "@/integrations/supabase/types";
import type { AgentChannel, AgentContext, AI_STAGES } from "./agent.server";

type Client = SupabaseClient<Database>;

const CONFIG_FIELDS = "ai_name,business_name,business_description,products_services,prices,opening_hours,faq,company_policies,return_policy,shipping_info,payment_methods,tone_of_voice,sales_strategy,rules,forbidden_topics,enabled,auto_reply_whatsapp,auto_reply_instagram,creativity,history_limit";

// Carrega configuração, empresa e catálogo num único lugar para todos os canais usarem o mesmo contexto.
export async function loadAgentSetup(client: Client, organizationId: string, contact: { name: string; stage: string }, channel: AgentChannel) {
  const [{ data: config }, { data: organization }, { data: products }] = await Promise.all([
    client.from("ai_configurations").select(CONFIG_FIELDS).eq("organization_id", organizationId).maybeSingle(),
    client.from("organizations").select("name,created_by").eq("id", organizationId).single(),
    client.from("products").select("name,description,price,promotional_price,payment_link").eq("organization_id", organizationId).eq("active", true).order("name"),
  ]);
  if (!config) return null;
  const context: AgentContext = {
    aiName: config.ai_name,
    businessName: config.business_name || organization?.name || "Empresa",
    businessDescription: config.business_description,
    productsServices: config.products_services,
    prices: config.prices,
    openingHours: config.opening_hours,
    faq: config.faq,
    companyPolicies: config.company_policies,
    returnPolicy: config.return_policy,
    shippingInfo: config.shipping_info,
    paymentMethods: config.payment_methods,
    toneOfVoice: config.tone_of_voice,
    salesStrategy: config.sales_strategy,
    rules: config.rules,
    forbiddenTopics: config.forbidden_topics,
    creativity: config.creativity,
    contactName: contact.name,
    contactStage: contact.stage,
    channel,
    products: (products ?? []).map((product) => ({ name: product.name, description: product.description, price: Number(product.price), promotionalPrice: product.promotional_price == null ? null : Number(product.promotional_price), paymentLink: product.payment_link })),
  };
  return { config, organization, context };
}

export function toModelHistory(rows: { sender: string; body: string }[]) {
  return rows.map((message): ModelMessage => ({ role: message.sender === "cliente" ? "user" : "assistant", content: message.body }));
}

// A IA só avança o funil; a regressão e a confirmação de venda continuam com a equipe.
export async function applyAgentStage(client: Client, contactId: string, stage: (typeof AI_STAGES)[number] | null) {
  if (!stage) return;
  await client.from("contacts").update({ stage, updated_at: new Date().toISOString() }).eq("id", contactId).neq("stage", "cliente");
}
