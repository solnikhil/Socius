import type { ProviderId } from "@socius/contracts/providers";
import { provider } from "@socius/contracts/providers";

// Neutral monogram tiles. Socius does not bundle third-party brand marks.
const tones: Record<ProviderId, string> = {
  ollama: "#3f3f46",
  lmstudio: "#4f46e5",
  llamacpp: "#a16207",
  openai: "#10a37f",
  anthropic: "#c96442",
  google: "#4285f4",
  mistral: "#f97316",
  xai: "#18181b",
  groq: "#f55036",
  deepseek: "#4d6bfe",
  cerebras: "#e8590c",
  fireworks: "#6d28d9",
  togetherai: "#0f6fff",
  perplexity: "#1f8a8a",
  cohere: "#39594d",
  deepinfra: "#2563eb",
  baseten: "#16a34a",
  huggingface: "#eab308",
  moonshotai: "#111827",
  alibaba: "#ff6a00",
  minimax: "#e11d48",
  zai: "#2d2d8f",
  azure: "#0078d4",
  "amazon-bedrock": "#d97706",
  "google-vertex": "#1a73e8",
  "google-vertex-anthropic": "#b45309",
  gateway: "#000000",
  openrouter: "#6366f1",
  "openai-compatible": "#64748b",
};

function monogram(name: string) {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  return (
    words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2)
  ).toUpperCase();
}

export function ProviderMark({
  id,
  size = 32,
}: {
  id: ProviderId;
  size?: number;
}) {
  return (
    <span
      className="provider-mark"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: tones[id],
      }}
    >
      {monogram(provider(id).name)}
    </span>
  );
}
