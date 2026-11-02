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