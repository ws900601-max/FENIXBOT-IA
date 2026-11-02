-- FenixBot v2: convites de equipe, PIN do WhatsApp e escrita sensível só pelo servidor.

-- PIN da verificação em duas etapas definido ao registrar o número na Cloud API.
ALTER TABLE public.whatsapp_tokens ADD COLUMN IF NOT EXISTS registration_pin text;

-- A conta do WhatsApp só é gravada pelo servidor, depois de validar o número na Meta.
DROP POLICY IF EXISTS "whatsapp_accounts_insert_admin" ON public.whatsapp_accounts;
DROP POLICY IF EXISTS "whatsapp_accounts_update_admin" ON public.whatsapp_accounts;
DROP POLICY IF EXISTS "whatsapp_accounts_delete_admin" ON public.whatsapp_accounts;
REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_accounts FROM authenticated;

-- Mensagens: membros leem; pelo navegador só se registra mensagem da equipe;
-- só administradores apagam. Mensagens do cliente e da IA vêm sempre do servidor.
DROP POLICY IF EXISTS "messages_org_access" ON public.messages;
REVOKE UPDATE ON public.messages FROM authenticated;
CREATE POLICY "messages_select_member" ON public.messages FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "messages_insert_team" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id) AND sender = 'atendente' AND external_message_id IS NULL);
CREATE POLICY "messages_delete_admin" ON public.messages FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['administrador']::public.app_role[]));

-- Convites de equipe: criados e aceitos pelo servidor; administradores consultam os pendentes.
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'atendente',
  token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_invitations_org_idx ON public.organization_invitations (organization_id, created_at DESC);
GRANT SELECT ON public.organization_invitations TO authenticated;
GRANT ALL ON public.organization_invitations TO service_role;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invitations_select_admin" ON public.organization_invitations FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['administrador']::public.app_role[]));

-- Funções e saída da equipe passam pelo servidor, que impede ficar sem administrador.
DROP POLICY IF EXISTS "user_roles_manage_admin" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_delete_admin" ON public.user_roles;
REVOKE UPDATE, DELETE ON public.user_roles FROM authenticated;
