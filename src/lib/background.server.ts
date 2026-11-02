import { AsyncLocalStorage } from "node:async_hooks";

type WaitUntil = (promise: Promise<unknown>) => void;

const store = new AsyncLocalStorage<WaitUntil | undefined>();

// O runtime (Cloudflare/Nitro) expõe waitUntil em lugares diferentes conforme o adaptador.
export function resolveWaitUntil(request: Request, ctx: unknown): WaitUntil | undefined {
  const candidates = [ctx, (ctx as { context?: unknown } | undefined)?.context, request];
  for (const candidate of candidates) {
    const fn = (candidate as { waitUntil?: unknown } | undefined)?.waitUntil;
    if (typeof fn === "function") return fn.bind(candidate) as WaitUntil;
  }
  return undefined;
}

export function withBackgroundContext<T>(waitUntil: WaitUntil | undefined, run: () => T) {
  return store.run(waitUntil, run);
}

// Continua o trabalho depois da resposta HTTP quando o runtime permite; caso contrário, aguarda inline.
export async function runInBackground(task: () => Promise<unknown>) {
  const promise = task().catch((error) => console.error("Tarefa em segundo plano falhou", error instanceof Error ? error.message : error));
  const waitUntil = store.getStore();
  if (waitUntil) {
    waitUntil(promise);
    return;
  }
  await promise;
}
