import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(context: { supabase: any; userId: string }, organizationId: string) {
  const { data: allowed } = await context.supabase.rpc("has_org_role", { _organization_id: organizationId, _roles: ["administrador"], _user_id: context.userId });
  if (!allowed) throw new Error("Somente administradores podem gerenciar a assinatura.");
}

export const getBillingSetup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async () => {
  const { mercadoPagoConfigured } = await import("./mercadopago.server");
  return { configured: mercadoPagoConfigured() };
});

export const createSubscriptionCheckout = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid(), planId: z.string().min(1).max(64), cycle: z.enum(["mensal", "anual"]) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context, data.organizationId);
    const email = typeof context.claims.email === "string" ? context.claims.email : null;
    if (!email) throw new Error("Sua conta precisa de um e-mail para assinar.");
    const { data: plan } = await context.supabase.from("plans").select("id,name,monthly_price,yearly_discount_percent").eq("id", data.planId).eq("active", true).maybeSingle();
    if (!plan) throw new Error("Plano não encontrado.");
    const monthly = Number(plan.monthly_price);
    const amount = data.cycle === "anual" ? monthly * 12 * (1 - plan.yearly_discount_percent / 100) : monthly;
    const { createPreapproval } = await import("./mercadopago.server");
    const origin = new URL(getRequest().url).origin;
    const preapproval = await createPreapproval({ organizationId: data.organizationId, planId: plan.id, planName: plan.name, cycle: data.cycle, amount, payerEmail: email, backUrl: `${origin}/planos?retorno=mercadopago` });
    if (!preapproval.init_point) throw new Error("O Mercado Pago não retornou o link de pagamento.");
    // Cria o registro pendente só quando ainda não existe assinatura; uma troca de plano é aplicada pelo webhook após a aprovação.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin.from("subscriptions").select("id,status").eq("organization_id", data.organizationId).maybeSingle();
    if (!existing || existing.status === "pendente" || existing.status === "cancelada" || existing.status === "expirada") {
      await supabaseAdmin.from("subscriptions").upsert({ organization_id: data.organizationId, plan_id: plan.id, billing_cycle: data.cycle, status: "pendente", mp_preapproval_id: preapproval.id, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
    }
    return { checkoutUrl: preapproval.init_point };
  });

export const manageSubscription = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid(), action: z.enum(["pausar", "cancelar", "reativar"]) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subscription } = await supabaseAdmin.from("subscriptions").select("mp_preapproval_id").eq("organization_id", data.organizationId).maybeSingle();
    if (!subscription?.mp_preapproval_id) throw new Error("Nenhuma assinatura do Mercado Pago encontrada.");
    const { updatePreapprovalStatus, syncPreapproval } = await import("./mercadopago.server");
    const target = data.action === "pausar" ? "paused" : data.action === "cancelar" ? "cancelled" : "authorized";
    await updatePreapprovalStatus(subscription.mp_preapproval_id, target);
    await syncPreapproval(supabaseAdmin, subscription.mp_preapproval_id);
    return { ok: true };
  });

export const getPlanStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase.rpc("is_org_member", { _organization_id: data.organizationId, _user_id: context.userId });
    if (!member) throw new Error("Sem acesso a esta empresa.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getEntitlements } = await import("./entitlements.server");
    return getEntitlements(supabaseAdmin, data.organizationId);
  });
