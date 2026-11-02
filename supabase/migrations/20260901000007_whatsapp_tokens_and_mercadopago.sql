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
