import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const API = "https://api.mercadopago.com";
type AdminClient = SupabaseClient<Database>;

export function mercadoPagoConfigured() {
  return Boolean(process.env["MERCADOPAGO_ACCESS_TOKEN"] && process.env["MERCADOPAGO_WEBHOOK_SECRET"]);
}

function accessToken() {
  const token = process.env["MERCADOPAGO_ACCESS_TOKEN"];
  if (!token) throw new Error("O Mercado Pago ainda não foi configurado.");
  return token;
}

async function mpRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${accessToken()}`, "Content-Type": "application/json", ...init.headers } });
  const payload = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message || `Erro do Mercado Pago (${response.status}).`);
  return payload;
}

type Preapproval = { id: string; status: string; external_reference?: string; next_payment_date?: string; date_created?: string; init_point?: string };

export async function createPreapproval(input: { organizationId: string; planId: string; planName: string; cycle: "mensal" | "anual"; amount: number; payerEmail: string; backUrl: string }) {
  return mpRequest<Preapproval>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: `Fenixbot ${input.planName} (${input.cycle})`,
      external_reference: `${input.organizationId}:${input.planId}:${input.cycle}`,
      payer_email: input.payerEmail,
      back_url: input.backUrl,
      status: "pending",
      auto_recurring: { frequency: input.cycle === "anual" ? 12 : 1, frequency_type: "months", transaction_amount: Math.round(input.amount * 100) / 100, currency_id: "BRL" },
    }),
  });
}

export async function updatePreapprovalStatus(id: string, status: "paused" | "cancelled" | "authorized") {
  return mpRequest<Preapproval>(`/preapproval/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ status }) });
}

// Mercado Pago assina "id:{data.id};request-id:{x-request-id};ts:{ts};" com a chave secreta do webhook.
export function verifyMercadoPagoSignature(request: Request, dataId: string) {
  const secret = process.env["MERCADOPAGO_WEBHOOK_SECRET"];
  const header = request.headers.get("x-signature");
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => part.trim().split("=", 2) as [string, string]));
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;
  const requestId = request.headers.get("x-request-id");
  const manifest = `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
  const expected = Buffer.from(createHmac("sha256", secret).update(manifest).digest("hex"), "hex");
  const received = Buffer.from(v1, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

const STATUS_MAP: Record<string, Database["public"]["Tables"]["subscriptions"]["Row"]["status"]> = { authorized: "ativa", pending: "pendente", paused: "pausada", cancelled: "cancelada" };

// Sempre consulta o estado real no Mercado Pago em vez de confiar no corpo do aviso.
export async function syncPreapproval(admin: AdminClient, preapprovalId: string, options: { paymentRejected?: boolean; paymentApprovedAt?: string } = {}) {
  const preapproval = await mpRequest<Preapproval>(`/preapproval/${encodeURIComponent(preapprovalId)}`);
  const [organizationId, planId, cycle] = (preapproval.external_reference ?? "").split(":");
  if (!organizationId || !planId || (cycle !== "mensal" && cycle !== "anual")) return;
  const { data: current } = await admin.from("subscriptions").select("id,mp_preapproval_id,status,started_at").eq("organization_id", organizationId).maybeSingle();
  const isCurrent = current?.mp_preapproval_id === preapproval.id;
  let status = STATUS_MAP[preapproval.status] ?? "pendente";
  if (status === "ativa" && options.paymentRejected) status = "atrasada";

  if (!isCurrent) {
    // Uma assinatura antiga ou abandonada não deve sobrescrever a atual; só uma nova autorizada assume o lugar.
    if (status !== "ativa" && current?.mp_preapproval_id && current.status !== "pendente") return;
    if (status === "ativa" && current?.mp_preapproval_id && current.mp_preapproval_id !== preapproval.id && current.status !== "cancelada") {
      try { await updatePreapprovalStatus(current.mp_preapproval_id, "cancelled"); } catch (error) { console.error("Falha ao cancelar assinatura anterior", error instanceof Error ? error.message : error); }
    }
  }
  const now = new Date().toISOString();
  await admin.from("subscriptions").upsert({
    organization_id: organizationId,
    plan_id: planId,
    billing_cycle: cycle,
    status,
    mp_preapproval_id: preapproval.id,
    next_billing_at: preapproval.next_payment_date ?? null,
    started_at: status === "ativa" && (!isCurrent || !current?.started_at) ? now : current?.started_at ?? null,
    ...(options.paymentApprovedAt ? { last_payment_at: options.paymentApprovedAt } : {}),
    updated_at: now,
  }, { onConflict: "organization_id" });
}

export async function handleMercadoPagoNotification(admin: AdminClient, type: string, dataId: string) {
  if (type === "subscription_preapproval") return syncPreapproval(admin, dataId);
  if (type === "subscription_authorized_payment") {
    const payment = await mpRequest<{ preapproval_id?: string; status?: string; payment?: { status?: string }; date_created?: string }>(`/authorized_payments/${encodeURIComponent(dataId)}`);
    if (!payment.preapproval_id) return;
    const paymentStatus = payment.payment?.status ?? payment.status;
    return syncPreapproval(admin, payment.preapproval_id, {
      paymentRejected: paymentStatus === "rejected",
      ...(paymentStatus === "approved" ? { paymentApprovedAt: payment.date_created ?? new Date().toISOString() } : {}),
    });
  }
}
