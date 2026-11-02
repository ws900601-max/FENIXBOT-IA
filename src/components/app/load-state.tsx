import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div role="alert" className="grid min-h-56 place-items-center rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
    <div><AlertCircle className="mx-auto size-7 text-destructive" /><p className="mt-3 text-sm font-medium">Não foi possível carregar</p><p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p><Button variant="outline" className="mt-4" onClick={onRetry}><RefreshCw />Tentar novamente</Button></div>
  </div>;
}