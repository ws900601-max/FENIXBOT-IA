import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/redefinir-senha")({ ssr: false, head: () => ({ meta: [{ title: "Redefinir senha — Fenixbot" }, { name: "description", content: "Defina uma nova senha para sua conta Fenixbot." }, { property: "og:title", content: "Redefinir senha — Fenixbot" }, { property: "og:description", content: "Recuperação segura de acesso." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: ResetPage });

function ResetPage() {
  const navigate = useNavigate();
  // O link do e-mail já traz a pessoa com sessão de recuperação; o Supabase avisa por PASSWORD_RECOVERY.
  const [valid, setValid] = useState<boolean | null>(() => typeof window !== "undefined" && (window.location.hash.includes("type=recovery") || new URLSearchParams(window.location.search).get("type") === "recovery") ? true : null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setValid(true); });
    // Sem evento em alguns segundos e sem sessão, o link expirou ou já foi usado.
    const timer = setTimeout(() => { void supabase.auth.getSession().then(({ data: session }) => setValid((current) => current ?? Boolean(session.session))); }, 1500);
    return () => { clearTimeout(timer); data.subscription.unsubscribe(); };
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) setError(updateError.code === "same_password" ? "A nova senha precisa ser diferente da atual." : updateError.code === "weak_password" ? "Senha fraca. Use pelo menos 8 caracteres, com letras e números." : "Não foi possível atualizar sua senha. Peça um novo link.");
    else await navigate({ to: "/dashboard" });
  }

  return <main className="grid min-h-screen place-items-center p-6"><section className="w-full max-w-sm"><h1 className="text-3xl font-semibold">Nova senha</h1>
    {valid === null ? <p className="mt-6 text-sm text-muted-foreground">Validando o link...</p>
      : valid ? <form onSubmit={submit} className="mt-7 space-y-4"><div><Label htmlFor="password">Nova senha</Label><Input id="password" name="password" type="password" minLength={8} required className="mt-2 h-11" /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button className="h-11 w-full" disabled={busy}>{busy ? "Salvando..." : "Salvar nova senha"}</Button></form>
      : <div className="mt-6 rounded-md border p-4 text-sm text-muted-foreground">Este link é inválido ou expirou. <Link to="/auth" className="text-primary">Solicite um novo link.</Link></div>}
  </section></main>;
}
