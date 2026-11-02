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
