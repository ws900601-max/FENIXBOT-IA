CREATE TABLE public.whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  waba_id text NOT NULL,
  phone_number_id text NOT NULL,
  business_name text,
  display_phone_number text,
  status text NOT NULL DEFAULT 'configuracao_necessaria' CHECK (status IN ('configuracao_necessaria', 'conectado', 'erro')),
  last_error text,
  last_sync_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id),
  UNIQUE (phone_number_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_accounts TO authenticated;
GRANT ALL ON public.whatsapp_accounts TO service_role;
ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_accounts_select_org" ON public.whatsapp_accounts FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "whatsapp_accounts_insert_admin" ON public.whatsapp_accounts FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, ARRAY['administrador'::public.app_role, 'gerente'::public.app_role]));
CREATE POLICY "whatsapp_accounts_update_admin" ON public.whatsapp_accounts FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, ARRAY['administrador'::public.app_role, 'gerente'::public.app_role])) WITH CHECK (public.has_org_role(organization_id, ARRAY['administrador'::public.app_role, 'gerente'::public.app_role]));
CREATE POLICY "whatsapp_accounts_delete_admin" ON public.whatsapp_accounts FOR DELETE TO authenticated USING (public.has_org_role(organization_id, ARRAY['administrador'::public.app_role, 'gerente'::public.app_role]));
CREATE INDEX whatsapp_accounts_organization_idx ON public.whatsapp_accounts(organization_id);

ALTER TABLE public.conversations ADD COLUMN channel text NOT NULL DEFAULT 'manual' CHECK (channel IN ('manual', 'whatsapp'));
CREATE INDEX conversations_channel_idx ON public.conversations(organization_id, channel);

ALTER TABLE public.messages ADD COLUMN external_message_id text;
ALTER TABLE public.messages ADD COLUMN delivery_status text CHECK (delivery_status IS NULL OR delivery_status IN ('pending', 'sent', 'delivered', 'read', 'failed'));
ALTER TABLE public.messages ADD COLUMN failure_reason text;
CREATE UNIQUE INDEX messages_external_message_id_unique ON public.messages(external_message_id) WHERE external_message_id IS NOT NULL;

CREATE TABLE public.whatsapp_message_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  external_message_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  occurred_at timestamptz NOT NULL,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_message_id, status, occurred_at)
);
GRANT SELECT ON public.whatsapp_message_status TO authenticated;
GRANT ALL ON public.whatsapp_message_status TO service_role;
ALTER TABLE public.whatsapp_message_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_status_select_org" ON public.whatsapp_message_status FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE INDEX whatsapp_message_status_message_idx ON public.whatsapp_message_status(message_id, occurred_at DESC);
CREATE INDEX whatsapp_message_status_org_idx ON public.whatsapp_message_status(organization_id);

ALTER TABLE public.ai_configurations ADD COLUMN auto_reply_whatsapp boolean NOT NULL DEFAULT false;