import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AdminClient = SupabaseClient<Database>;

// Empresas novas usam os limites do plano Nano durante o teste grátis.
export const TRIAL_DAYS = Number(process.env["TRIAL_DAYS"] ?? 7);
const TRIAL_PLAN_ID = "nano";
// "atrasada" mantém o acesso enquanto o Mercado Pago tenta cobrar de novo.
const PAYING_STATUSES = ["ativa", "atrasada"];

export type Entitlements = {
  status: "assinatura" | "teste" | "bloqueado";
  planId: string | null;
  planName: string | null;
  trialEndsAt: string | null;
  limits: { aiTokens: number; connections: number; attendants: number | null };
  usage: { aiTokensThisMonth: number; connections: number; members: number };
};

function startOfMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function getEntitlements(admin: AdminClient, organizationId: string): Promise<Entitlements> {
  const [{ data: organization }, { data: subscription }, { data: tokenRows }, { count: whatsapp }, { count: instagram }, { count: members }] = await Promise.all([
    admin.from("organizations").select("created_at").eq("id", organizationId).single(),
    admin.from("subscriptions").select("plan_id,status").eq("organization_id", organizationId).maybeSingle(),
    admin.from("ai_usage_events").select("total_tokens").eq("organization_id", organizationId).eq("status", "sucesso").gte("created_at", startOfMonth()),
    admin.from("whatsapp_accounts").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    admin.from("instagram_accounts").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    admin.from("user_roles").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
  ]);
  const paying = subscription && PAYING_STATUSES.includes(subscription.status);
  const trialEnds = organization ? new Date(new Date(organization.created_at).getTime() + TRIAL_DAYS * 86_400_000) : null;
  const inTrial = !paying && trialEnds !== null && trialEnds.getTime() > Date.now();
  const planId = paying ? subscription.plan_id : inTrial ? TRIAL_PLAN_ID : null;
  const { data: plan } = planId ? await admin.from("plans").select("id,name,ai_tokens,connections,attendants").eq("id", planId).maybeSingle() : { data: null };
  return {
    status: paying ? "assinatura" : inTrial ? "teste" : "bloqueado",
    planId: plan?.id ?? null,
    planName: plan?.name ?? null,
    trialEndsAt: trialEnds?.toISOString() ?? null,
    limits: { aiTokens: Number(plan?.ai_tokens ?? 0), connections: plan?.connections ?? 0, attendants: plan ? plan.attendants : 0 },
    usage: {
      aiTokensThisMonth: (tokenRows ?? []).reduce((sum, row) => sum + (row.total_tokens ?? 0), 0),
      connections: (whatsapp ?? 0) + (instagram ?? 0),
      members: members ?? 0,
    },
  };
}

export class PlanLimitError extends Error {}

export async function assertCanUseAI(admin: AdminClient, organizationId: string) {
  const entitlements = await getEntitlements(admin, organizationId);
  if (entitlements.status === "bloqueado") throw new PlanLimitError("O teste grátis terminou. Assine um plano para continuar usando a IA.");
  if (entitlements.usage.aiTokensThisMonth >= entitlements.limits.aiTokens) throw new PlanLimitError(`Os ${entitlements.limits.aiTokens.toLocaleString("pt-BR")} tokens de IA do plano ${entitlements.planName} acabaram neste mês. Faça upgrade para continuar.`);
  return entitlements;
}

// Reconectar o mesmo canal não conta como conexão nova.
export async function assertCanConnectChannel(admin: AdminClient, organizationId: string, alreadyConnected: boolean) {
  const entitlements = await getEntitlements(admin, organizationId);
  if (entitlements.status === "bloqueado") throw new PlanLimitError("O teste grátis terminou. Assine um plano para conectar canais.");
  if (!alreadyConnected && entitlements.usage.connections >= entitlements.limits.connections) throw new PlanLimitError(`O plano ${entitlements.planName} permite ${entitlements.limits.connections} conexão(ões) de canal. Faça upgrade para conectar mais.`);
}

export async function assertCanAddMember(admin: AdminClient, organizationId: string) {
  const entitlements = await getEntitlements(admin, organizationId);
  if (entitlements.status === "bloqueado") throw new PlanLimitError("O teste grátis terminou. Assine um plano para adicionar pessoas.");
  const limit = entitlements.limits.attendants;
  if (limit !== null && entitlements.usage.members >= limit) throw new PlanLimitError(`O plano ${entitlements.planName} permite até ${limit} pessoas na equipe. Faça upgrade para adicionar mais.`);
}
