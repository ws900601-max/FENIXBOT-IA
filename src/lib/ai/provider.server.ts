import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { experimental_transcribe as transcribe, generateText } from "ai";

// Gemini (cota grátis) é o padrão; a OpenAI entra quando só a chave dela estiver configurada ou AI_PROVIDER=openai.
type ProviderName = "google" | "openai";

const DEFAULT_MODELS: Record<ProviderName, string> = { google: "gemini-flash-latest", openai: "gpt-5.4-mini" };

function providerName(): ProviderName {
  const chosen = process.env["AI_PROVIDER"];
  if (chosen === "google" || chosen === "openai") return chosen;
  if (process.env["GOOGLE_GENERATIVE_AI_API_KEY"]) return "google";
  if (process.env["OPENAI_API_KEY"]) return "openai";
  throw new Error("Nenhuma chave de IA configurada. Adicione GOOGLE_GENERATIVE_AI_API_KEY ou OPENAI_API_KEY.");
}

function requiredKey(name: "GOOGLE_GENERATIVE_AI_API_KEY" | "OPENAI_API_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`Configuração ausente: ${name}`);
  return value;
}

export function aiModelId() {
  try {
    const name = providerName();
    return `${name}/${process.env["AI_MODEL"] || DEFAULT_MODELS[name]}`;
  } catch {
    return "nao-configurado";
  }
}

export function languageModel() {
  const name = providerName();
  const model = process.env["AI_MODEL"] || DEFAULT_MODELS[name];
  if (name === "google") return createGoogleGenerativeAI({ apiKey: requiredKey("GOOGLE_GENERATIVE_AI_API_KEY") })(model);
  return createOpenAI({ apiKey: requiredKey("OPENAI_API_KEY") })(model);
}

// Transcreve áudios do WhatsApp (ogg/opus). A OpenAI usa o endpoint de transcrição; o Gemini ouve o arquivo direto.
export async function transcribeAudio(data: Uint8Array, mediaType: string) {
  if (process.env["OPENAI_API_KEY"] && providerName() === "openai") {
    const openai = createOpenAI({ apiKey: requiredKey("OPENAI_API_KEY") });
    const result = await transcribe({ model: openai.transcription(process.env["TRANSCRIPTION_MODEL"] || "gpt-4o-mini-transcribe"), audio: data, providerOptions: { openai: { language: "pt" } } });
    return result.text.trim();
  }
  const { text } = await generateText({
    model: languageModel(),
    messages: [{ role: "user", content: [
      { type: "text", text: "Transcreva este áudio em português do Brasil, exatamente como foi falado. Responda só com a transcrição, sem comentários." },
      { type: "file", data, mediaType: mediaType.split(";")[0] || "audio/ogg" },
    ] }],
  });
  return text.trim();
}
