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