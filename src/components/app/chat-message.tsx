import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Balões leves para o inbox: mensagens de WhatsApp e Instagram são texto simples,
// então não precisam do renderizador de markdown (que pesa vários MB no navegador).

export function Message({ className, from, ...props }: HTMLAttributes<HTMLDivElement> & { from: "user" | "assistant" }) {
  return <div className={cn("group flex w-full max-w-[95%] flex-col gap-2", from === "user" ? "is-user ml-auto justify-end" : "is-assistant", className)} {...props} />;
}

export function MessageContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden rounded-lg text-sm", className)} {...props} />;
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
// *negrito* no estilo do WhatsApp, sem pegar asteriscos soltos.
const BOLD_PATTERN = /\*([^*\n]+)\*/g;

function withBold(text: string, keyPrefix: string) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    parts.push(<strong key={`${keyPrefix}-${index}`}>{match[1]}</strong>);
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function ChatText({ children }: { children: string }) {
  return <p className="whitespace-pre-wrap break-words leading-relaxed">
    {children.split(URL_PATTERN).map((part, index) => /^https?:\/\//.test(part)
      ? <a key={index} href={part} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">{part}</a>
      : withBold(part, String(index)))}
  </p>;
}
