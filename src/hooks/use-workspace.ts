import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Workspace = { id: string; name: string; role: "administrador" | "gerente" | "atendente" };

type WorkspaceResult = { workspace: Workspace | null; needsSetup: boolean };

let cachedResult: WorkspaceResult | null = null;
let pendingLoad: Promise<WorkspaceResult> | null = null;

async function fetchWorkspace(): Promise<WorkspaceResult> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData.user;
  if (!user) return { workspace: null, needsSetup: false };

  const { data: membership, error: membershipError } = await supabase
    .from("user_roles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) return { workspace: null, needsSetup: true };

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", membership.organization_id)
    .single();
  if (orgError) throw orgError;
  return {
    workspace: { id: org.id, name: org.name, role: membership.role },
    needsSetup: false,
  };
}

function getWorkspace(force = false) {
  if (!force && cachedResult) return Promise.resolve(cachedResult);
  if (!force && pendingLoad) return pendingLoad;
  pendingLoad = fetchWorkspace()
    .then((result) => {
      cachedResult = result;
      return result;
    })
    .finally(() => {
      pendingLoad = null;
    });
  return pendingLoad;
}

export function clearWorkspaceCache() {
  cachedResult = null;
  pendingLoad = null;
}

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(() => cachedResult?.workspace ?? null);
  const [loading, setLoading] = useState(() => cachedResult === null);
  const [needsSetup, setNeedsSetup] = useState(() => cachedResult?.needsSetup ?? false);
  const [error, setError] = useState("");

  const load = useCallback(async (force = true) => {
    setLoading(true);
    setError("");
    try {
      const result = await getWorkspace(force);
      setWorkspace(result.workspace);
      setNeedsSetup(result.needsSetup);
    } catch {
      setError("Não foi possível carregar sua empresa. Verifique a conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(false); }, [load]);
  return { workspace, loading, needsSetup, error, reload: () => load(true) };
}
