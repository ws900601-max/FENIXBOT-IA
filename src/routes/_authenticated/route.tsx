import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LoadError } from "@/components/app/load-state";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // Lê a sessão guardada no navegador, sem ir à rede a cada troca de página; o servidor e o banco
  // validam o token em toda leitura e gravação, e uma sessão vencida é renovada ou leva ao login.
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  errorComponent: () => { const router = useRouter(); return <main className="grid min-h-screen place-items-center bg-background p-6"><LoadError message="Não foi possível validar sua sessão. Verifique a conexão e tente novamente." onRetry={() => void router.invalidate()} /></main>; },
  component: () => <Outlet />,
});
