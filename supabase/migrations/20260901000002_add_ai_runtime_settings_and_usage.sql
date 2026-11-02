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