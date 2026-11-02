-- FenixBot: banco completo. Cole tudo no SQL Editor do Supabase e clique em Run (uma vez, num projeto novo).
-- Gerado a partir de supabase/migrations/ (npm run db:bundle).

-- ===== 20260901000000_create_secure_core_mvp.sql =====
CREATE TYPE public.app_role AS ENUM ('administrador', 'gerente', 'atendente');
CREATE TYPE public.lead_stage AS ENUM ('novo', 'contato', 'interessado', 'qualificado', 'proposta', 'pagamento', 'cliente');
CREATE TYPE public.conversation_status AS ENUM ('aberta', 'aguardando_cliente', 'encerrada');
CREATE TYPE public.message_sender AS ENUM ('cliente', 'ia', 'atendente');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  avatar_url text,
  phone text,
  job_title text,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_self" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'atendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE INDEX user_roles_user_org_idx ON public.user_roles(user_id, organization_id);

CREATE OR REPLACE FUNCTION public.is_org_member(_organization_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE organization_id = _organization_id AND user_id = _user_id)
$$;
CREATE OR REPLACE FUNCTION public.has_org_role(_organization_id uuid, _roles public.app_role[], _user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE organization_id = _organization_id AND user_id = _user_id AND role = ANY(_roles))
$$;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, public.app_role[], uuid) TO authenticated;

CREATE POLICY "organizations_insert_owner" ON public.organizations FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "organizations_select_member_or_creator" ON public.organizations FOR SELECT TO authenticated USING (created_by = auth.uid() OR public.is_org_member(id));
CREATE POLICY "organizations_update_admin" ON public.organizations FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_org_role(id, ARRAY['administrador']::public.app_role[])) WITH CHECK (created_by = auth.uid() OR public.has_org_role(id, ARRAY['administrador']::public.app_role[]));
CREATE POLICY "user_roles_select_org" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_org_member(organization_id));
CREATE POLICY "user_roles_insert_creator" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.created_by = auth.uid()));
CREATE POLICY "user_roles_manage_admin" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, ARRAY['administrador']::public.app_role[])) WITH CHECK (public.has_org_role(organization_id, ARRAY['administrador']::public.app_role[]));
CREATE POLICY "user_roles_delete_admin" ON public.user_roles FOR DELETE TO authenticated USING (public.has_org_role(organization_id, ARRAY['administrador']::public.app_role[]));

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  source text NOT NULL DEFAULT 'WhatsApp',
  tags text[] NOT NULL DEFAULT '{}',
  stage public.lead_stage NOT NULL DEFAULT 'novo',
  lead_score integer NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  assigned_to uuid,
  notes text,
  last_interaction_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE INDEX contacts_org_stage_idx ON public.contacts(organization_id, stage);
CREATE INDEX contacts_org_updated_idx ON public.contacts(organization_id, updated_at DESC);
CREATE POLICY "contacts_org_access" ON public.contacts FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status public.conversation_status NOT NULL DEFAULT 'aberta',
  unread_count integer NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  assigned_to uuid,
  handled_by_ai boolean NOT NULL DEFAULT true,
  last_message text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE INDEX conversations_org_recent_idx ON public.conversations(organization_id, last_message_at DESC);
CREATE POLICY "conversations_org_access" ON public.conversations FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender public.message_sender NOT NULL,
  body text NOT NULL,
  message_type text NOT NULL DEFAULT 'texto',
  sent_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX messages_conversation_sent_idx ON public.messages(conversation_id, sent_at);
CREATE POLICY "messages_org_access" ON public.messages FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  promotional_price numeric(12,2) CHECK (promotional_price IS NULL OR promotional_price >= 0),
  image_url text,
  stock_status text NOT NULL DEFAULT 'disponivel',
  payment_link text,
  product_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE INDEX products_org_active_idx ON public.products(organization_id, active);
CREATE POLICY "products_org_access" ON public.products FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));

CREATE TABLE public.ai_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  ai_name text NOT NULL DEFAULT 'Assistente',
  business_name text NOT NULL DEFAULT '',
  business_description text NOT NULL DEFAULT '',
  products_services text NOT NULL DEFAULT '',
  prices text NOT NULL DEFAULT '',
  opening_hours text NOT NULL DEFAULT '',
  faq text NOT NULL DEFAULT '',
  company_policies text NOT NULL DEFAULT '',
  return_policy text NOT NULL DEFAULT '',
  shipping_info text NOT NULL DEFAULT '',
  payment_methods text NOT NULL DEFAULT '',
  tone_of_voice text NOT NULL DEFAULT 'Profissional e acolhedor',
  sales_strategy text NOT NULL DEFAULT '',
  rules text NOT NULL DEFAULT '',
  forbidden_topics text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_configurations TO authenticated;
GRANT ALL ON public.ai_configurations TO service_role;
ALTER TABLE public.ai_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_config_select_org" ON public.ai_configurations FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "ai_config_manage_admin" ON public.ai_configurations FOR ALL TO authenticated USING (public.has_org_role(organization_id, ARRAY['administrador','gerente']::public.app_role[])) WITH CHECK (public.has_org_role(organization_id, ARRAY['administrador','gerente']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;


-- ===== 20260901000001_harden_security_definer_permissions.sql =====
REVOKE ALL ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_org_role(uuid, public.app_role[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user_profile() TO service_role;

-- ===== 20260901000002_add_ai_runtime_settings_and_usage.sql =====
ALTER TABLE public.ai_configurations
  ADD COLUMN creativity text NOT NULL DEFAULT 'equilibrada',
  ADD COLUMN history_limit integer NOT NULL DEFAULT 12;

ALTER TABLE public.ai_configurations
  ADD CONSTRAINT ai_configurations_creativity_valid CHECK (creativity IN ('precisa', 'equilibrada', 'criativa')),
  ADD CONSTRAINT ai_configurations_history_limit_valid CHECK (history_limit BETWEEN 4 AND 30);

CREATE TABLE public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL,
  model text NOT NULL,
  status text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  duration_ms integer NOT NULL DEFAULT 0,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_events_status_valid CHECK (status IN ('sucesso', 'erro'))
);

GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_usage_events_select_org
ON public.ai_usage_events
FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id));

CREATE INDEX ai_usage_events_org_created_idx ON public.ai_usage_events (organization_id, created_at DESC);
CREATE INDEX ai_usage_events_conversation_idx ON public.ai_usage_events (conversation_id);

-- ===== 20260901000003_add_whatsapp_cloud_integration.sql =====
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

-- ===== 20260901000004_add_whatsapp_app_identifier.sql =====
ALTER TABLE public.whatsapp_accounts ADD COLUMN app_id text;

-- ===== 20260901000005_plans_and_subscriptions.sql =====
CREATE TABLE public.plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  monthly_price numeric NOT NULL,
  yearly_discount_percent integer NOT NULL DEFAULT 0,
  ai_tokens bigint NOT NULL,
  connections integer NOT NULL,
  attendants integer,
  features text[] NOT NULL DEFAULT '{}',
  popular boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  cta text NOT NULL DEFAULT 'Assinar',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_select_active ON public.plans FOR SELECT TO authenticated USING (active);

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES public.plans(id),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('ativa','pendente','atrasada','pausada','cancelada','expirada')),
  billing_cycle text NOT NULL DEFAULT 'mensal' CHECK (billing_cycle IN ('mensal','anual')),
  started_at timestamptz,
  next_billing_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_select_org ON public.subscriptions FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

INSERT INTO public.plans (id,name,description,monthly_price,yearly_discount_percent,ai_tokens,connections,attendants,features,popular,sort_order,cta) VALUES
('nano','Nano','Automação essencial com IA para centralizar atendimento e vendas.',129.99,15,5000000,1,5,ARRAY['1 conexão de canal','WhatsApp oficial, WhatsApp Web, Instagram ou e-mail','Até 5 atendentes simultâneos','5 milhões de tokens de IA','Automações e gatilhos ilimitados','Chat no site','Gestão de 1 grupo','CRM Kanban com 2 quadros','15.000 webhooks','Rastreamento de anúncios','Recuperação automática de carrinho','Recuperação automática de Pix','Assistente Sexta-Feira','Caixa de entrada omnichannel','Relatórios básicos','Gestão de contatos','Qualificação de leads'],false,1,'Começar com Nano'),
('ouro','Ouro','Automação avançada para equipes que precisam de mais capacidade e controle.',299.99,15,10000000,1,NULL,ARRAY['Tudo do Nano, mais:','Atendentes ilimitados','10 milhões de tokens de IA','Gestão de até 3 grupos','CRM Kanban com 5 quadros','30.000 webhooks','API aberta (POST / PUT / GET)','Agenda nativa','Automações avançadas','Relatórios avançados','Qualificação avançada de leads','Recuperação avançada de vendas','Suporte prioritário','Número adicional: +R$ 97/mês'],true,2,'Começar com Ouro'),
('pro','Pro','Capacidade máxima de IA para operações de alto volume.',799.99,15,50000000,3,NULL,ARRAY['50 milhões de tokens de IA','3 conexões incluídas','WhatsApp oficial, WhatsApp Web, Instagram e e-mail','Atendentes e operadores ilimitados','Sexta-Feira avançada','Respostas humanizadas 24/7','CRM e Kanban avançados','Automações e webhooks avançados','API aberta','Relatórios avançados','Gerente de conta dedicado','Suporte prioritário','Implantação VIP','Integrações avançadas'],false,3,'Ativar Pro');

-- ===== 20260901000006_instagram_channel.sql =====
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_channel_check CHECK (channel IN ('manual','whatsapp','instagram','email'));
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS instagram_id text;
CREATE INDEX IF NOT EXISTS contacts_org_instagram_idx ON public.contacts(organization_id, instagram_id);

CREATE TABLE public.instagram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  ig_user_id text NOT NULL UNIQUE,
  username text,
  status text NOT NULL DEFAULT 'conectado' CHECK (status IN ('conectado','atencao','desconectado')),
  last_error text,
  last_sync_at timestamptz,
  connected_at timestamptz,
  token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.instagram_accounts TO authenticated;
GRANT ALL ON public.instagram_accounts TO service_role;
ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros veem a conta do Instagram" ON public.instagram_accounts FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));

-- Tokens: somente o servidor acessa
CREATE TABLE public.instagram_tokens (
  account_id uuid PRIMARY KEY REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.instagram_tokens TO service_role;
ALTER TABLE public.instagram_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.instagram_oauth_states (
  state text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.instagram_oauth_states TO service_role;
ALTER TABLE public.instagram_oauth_states ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_configurations ADD COLUMN IF NOT EXISTS auto_reply_instagram boolean NOT NULL DEFAULT false;

-- ===== 20260901000007_whatsapp_tokens_and_mercadopago.sql =====
-- Tokens do WhatsApp por organização (Embedded Signup): somente o servidor acessa
CREATE TABLE public.whatsapp_tokens (
  account_id uuid PRIMARY KEY REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_tokens TO service_role;
ALTER TABLE public.whatsapp_tokens ENABLE ROW LEVEL SECURITY;

-- Assinaturas recorrentes do Mercado Pago
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS mp_preapproval_id text UNIQUE;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_payment_at timestamptz;


-- ===== 20260901000008_sync_whatsapp_billing_schema.sql =====
CREATE TABLE IF NOT EXISTS public.whatsapp_tokens (
  account_id uuid PRIMARY KEY REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_tokens TO service_role;
ALTER TABLE public.whatsapp_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS mp_preapproval_id text UNIQUE;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_payment_at timestamptz;

-- ===== 20261102000000_fenixbot_v2_security_and_team.sql =====
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

