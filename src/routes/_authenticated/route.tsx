import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LoadError } from "@/components/app/load-state";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (!data.user && !error) throw redirect({ to: "/auth" });
    if (error) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw redirect({ to: "/auth" });
      throw error;
    }
    return { user: data.user };
  },
  errorComponent: () => { const router = useRouter(); return <main className="grid min-h-screen place-items-center bg-background p-6"><LoadError message="Não foi possível validar sua sessão. Verifique a conexão e tente novamente." onRetry={() => void router.invalidate()} /></main>; },
  component: () => <Outlet />,
});
