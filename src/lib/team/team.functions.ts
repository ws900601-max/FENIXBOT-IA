import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = ["administrador", "gerente", "atendente"] as const;
const orgInput = z.object({ organizationId: z.string().uuid() });

async function requireAdmin(context: { supabase: any; userId: string }, organizationId: string) {
  const { data: allowed } = await context.supabase.rpc("has_org_role", { _organization_id: organizationId, _roles: ["administrador"], _user_id: context.userId });
  if (!allowed) throw new Error("Somente administradores podem gerenciar a equipe.");
}

export const listTeam = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((i) => orgInput.parse(i)).handler(async ({ data, context }) => {
  // A leitura com o cliente do usuário confirma pelas regras do banco que ele faz parte da empresa.
  const { data: roles, error } = await context.supabase.from("user_roles").select("id,user_id,role,created_at").eq("organization_id", data.organizationId).order("created_at");
  if (error || !roles?.length) throw new Error("A equipe não pôde ser carregada.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: profiles }, users] = await Promise.all([
    supabaseAdmin.from("profiles").select("id,full_name").in("id", roles.map((role) => role.user_id)),
    Promise.all(roles.map((role) => supabaseAdmin.auth.admin.getUserById(role.user_id))),
  ]);
  const members = roles.map((role, index) => ({
    ...role,
    name: profiles?.find((profile) => profile.id === role.user_id)?.full_name || null,
    email: users[index]?.data.user?.email ?? null,
  }));
  const isAdmin = roles.some((role) => role.user_id === context.userId && role.role === "administrador");
  const { data: invitations } = isAdmin
    ? await context.supabase.from("organization_invitations").select("id,email,role,token,expires_at,created_at").eq("organization_id", data.organizationId).is("accepted_at", null).order("created_at", { ascending: false })
    : { data: [] };
  return { members, invitations: invitations ?? [], me: context.userId };
});

export const createInvitation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i) => orgInput.extend({ email: z.string().trim().toLowerCase().email().max(254), role: z.enum(ROLES) }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertCanAddMember } = await import("@/lib/billing/entitlements.server");
    await assertCanAddMember(supabaseAdmin, data.organizationId);
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    // Um convite novo para o mesmo e-mail substitui o pendente.
    await supabaseAdmin.from("organization_invitations").delete().eq("organization_id", data.organizationId).eq("email", data.email).is("accepted_at", null);
    const { error } = await supabaseAdmin.from("organization_invitations").insert({ organization_id: data.organizationId, email: data.email, role: data.role, token, invited_by: context.userId });
    if (error) throw new Error("Não foi possível criar o convite.");
    return { token };
  });

export const revokeInvitation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i) => orgInput.extend({ invitationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("organization_invitations").delete().eq("id", data.invitationId).eq("organization_id", data.organizationId);
    return { ok: true };
  });

async function adminCount(admin: any, organizationId: string) {
  const { count } = await admin.from("user_roles").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("role", "administrador");
  return count ?? 0;
}

export const changeMemberRole = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i) => orgInput.extend({ memberId: z.string().uuid(), role: z.enum(ROLES) }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: member } = await supabaseAdmin.from("user_roles").select("id,role").eq("id", data.memberId).eq("organization_id", data.organizationId).maybeSingle();
    if (!member) throw new Error("Membro não encontrado.");
    if (member.role === "administrador" && data.role !== "administrador" && (await adminCount(supabaseAdmin, data.organizationId)) <= 1) throw new Error("A empresa precisa de pelo menos um administrador.");
    await supabaseAdmin.from("user_roles").update({ role: data.role }).eq("id", member.id);
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i) => orgInput.extend({ memberId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: member } = await supabaseAdmin.from("user_roles").select("id,user_id,role").eq("id", data.memberId).eq("organization_id", data.organizationId).maybeSingle();
    if (!member) throw new Error("Membro não encontrado.");
    if (member.user_id === context.userId) throw new Error("Você não pode remover a si mesmo.");
    if (member.role === "administrador" && (await adminCount(supabaseAdmin, data.organizationId)) <= 1) throw new Error("A empresa precisa de pelo menos um administrador.");
    await supabaseAdmin.from("user_roles").delete().eq("id", member.id);
    return { ok: true };
  });

const tokenInput = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });

// Pública: mostra para quem abriu o link qual empresa está convidando.
export const getInvitation = createServerFn({ method: "POST" }).inputValidator((i) => tokenInput.parse(i)).handler(async ({ data }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: invitation } = await supabaseAdmin.from("organization_invitations").select("email,role,expires_at,accepted_at,organizations(name)").eq("token", data.token).maybeSingle();
  if (!invitation) return { status: "invalido" as const };
  if (invitation.accepted_at) return { status: "usado" as const };
  if (new Date(invitation.expires_at).getTime() < Date.now()) return { status: "expirado" as const };
  const [user, domain] = invitation.email.split("@");
  return { status: "valido" as const, organizationName: invitation.organizations?.name ?? "Empresa", role: invitation.role, emailHint: `${user?.slice(0, 2)}***@${domain}` };
});

export const acceptInvitation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((i) => tokenInput.parse(i)).handler(async ({ data, context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: invitation } = await supabaseAdmin.from("organization_invitations").select("id,organization_id,email,role,expires_at,accepted_at").eq("token", data.token).maybeSingle();
  if (!invitation || invitation.accepted_at) throw new Error("Este convite não é mais válido.");
  if (new Date(invitation.expires_at).getTime() < Date.now()) throw new Error("Este convite expirou. Peça um novo ao administrador.");
  const email = typeof context.claims.email === "string" ? context.claims.email.toLowerCase() : "";
  if (email !== invitation.email.toLowerCase()) throw new Error(`Este convite foi enviado para outro e-mail. Entre com a conta ${invitation.email}.`);
  const { data: alreadyMember } = await supabaseAdmin.from("user_roles").select("id").eq("organization_id", invitation.organization_id).eq("user_id", context.userId).maybeSingle();
  if (!alreadyMember) {
    // Vários convites podem estar pendentes; o limite do plano vale na hora de entrar.
    const { assertCanAddMember } = await import("@/lib/billing/entitlements.server");
    await assertCanAddMember(supabaseAdmin, invitation.organization_id);
  }
  const { error } = await supabaseAdmin.from("user_roles").upsert({ organization_id: invitation.organization_id, user_id: context.userId, role: invitation.role }, { onConflict: "organization_id,user_id" });
  if (error) throw new Error("Não foi possível entrar na equipe.");
  await supabaseAdmin.from("organization_invitations").update({ accepted_at: new Date().toISOString(), accepted_by: context.userId }).eq("id", invitation.id);
  return { organizationId: invitation.organization_id };
});
