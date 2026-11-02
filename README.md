# FenixBot

Atendimento e vendas com IA para WhatsApp e Instagram, para várias empresas. A agente "Sexta Feira" responde clientes, avança o funil de vendas e passa a conversa para a equipe quando precisa.

Feito com TanStack Start, React 19, Tailwind e Supabase. Roda na Vercel (padrão), em servidor Node (Hostinger/VPS) ou na Cloudflare.

## Como colocar no ar (grátis para começar)

### 1. Banco de dados (Supabase)
1. Em [supabase.com](https://supabase.com), crie um projeto (região São Paulo).
2. Abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/setup-completo.sql` e clique em **Run** (uma vez só, num projeto novo).
3. Em **Authentication → URL Configuration**, coloque o endereço do site em **Site URL** (ex.: `https://fenixbot.vercel.app`) e adicione `https://SEU-SITE/**` em **Redirect URLs**.
4. Em **Project Settings → API Keys**, anote a URL do projeto, a chave **publishable** e a chave **secret** (essa é secreta).
5. Login com Google (opcional): **Authentication → Sign In / Providers → Google**.

### 2. Chave da IA
- Gemini (cota grátis): crie em [aistudio.google.com/apikey](https://aistudio.google.com/apikey) e use em `GOOGLE_GENERATIVE_AI_API_KEY`.
- Ou OpenAI: `OPENAI_API_KEY` (pago por uso).

### 3. Hospedagem (Vercel)
1. Em [vercel.com](https://vercel.com), entre com o GitHub e importe este repositório.
2. Em **Environment Variables**, cadastre as variáveis do arquivo `.env.example` (Supabase e IA são obrigatórias; WhatsApp, Instagram e Mercado Pago podem esperar).
3. Clique em **Deploy**.

Para servidor Node (Hostinger/VPS): `NITRO_PRESET=node-server npm run build` e depois `node .output/server/index.mjs`.

### 4. Integrações (quando quiser)
| Serviço | URL do webhook para cadastrar |
|---|---|
| WhatsApp (Meta), campo **messages** | `https://SEU-SITE/api/public/webhooks/whatsapp` |
| Instagram (Meta) | `https://SEU-SITE/api/public/instagram/webhook` |
| Mercado Pago, eventos **Planos e assinaturas** | `https://SEU-SITE/api/public/webhooks/mercadopago` |

## Desenvolvimento
```sh
cp .env.example .env   # preencha com as chaves do Supabase e da IA
npm install
npm run dev            # http://localhost:3000
npm run typecheck
```

## Arquitetura
- Todo dado operacional pertence a uma organização e é protegido por regras no banco (RLS); uma empresa nunca vê dados de outra.
- Funções de equipe ficam numa tabela separada dos perfis e só mudam pelo servidor, que impede a empresa de ficar sem administrador.
- Mensagens de cliente e de IA, a conta do WhatsApp e os tokens dos canais são gravados só pelo servidor.
- "Gerar com IA" no inbox cria um rascunho editável: nada é enviado nem muda quem conduz a conversa até a equipe clicar em Enviar.
- Nas respostas automáticas, a IA sinaliza transferência para humano (`[[TRANSFERIR_HUMANO]]`) e avanço do funil (`[[ETAPA:...]]`) com marcadores removidos antes de salvar; o servidor só avança etapas e nunca confirma venda.
- Mensagens enviadas em sequência são agrupadas antes de a IA responder; áudios são transcritos antes.
- Planos: teste grátis de `TRIAL_DAYS` dias com os limites do Nano; depois, IA, conexões e equipe seguem os limites do plano assinado. Sem plano, as conversas ficam com a equipe.
