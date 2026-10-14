import type { ProviderId } from "@socius/contracts/providers";
import { provider } from "@socius/contracts/providers";
import alibabacloudColor from "@lobehub/icons-static-svg/icons/alibabacloud-color.svg?url";
import anthropic from "@lobehub/icons-static-svg/icons/anthropic.svg?url";
import azureColor from "@lobehub/icons-static-svg/icons/azure-color.svg?url";
import baseten from "@lobehub/icons-static-svg/icons/baseten.svg?url";
import bedrockColor from "@lobehub/icons-static-svg/icons/bedrock-color.svg?url";
import cerebrasColor from "@lobehub/icons-static-svg/icons/cerebras-color.svg?url";
import claudeColor from "@lobehub/icons-static-svg/icons/claude-color.svg?url";
import cohereColor from "@lobehub/icons-static-svg/icons/cohere-color.svg?url";
import deepinfraColor from "@lobehub/icons-static-svg/icons/deepinfra-color.svg?url";
import deepseekColor from "@lobehub/icons-static-svg/icons/deepseek-color.svg?url";
import fireworksColor from "@lobehub/icons-static-svg/icons/fireworks-color.svg?url";
import geminiColor from "@lobehub/icons-static-svg/icons/gemini-color.svg?url";
import groq from "@lobehub/icons-static-svg/icons/groq.svg?url";
import huggingfaceColor from "@lobehub/icons-static-svg/icons/huggingface-color.svg?url";
import lmstudio from "@lobehub/icons-static-svg/icons/lmstudio.svg?url";
import minimaxColor from "@lobehub/icons-static-svg/icons/minimax-color.svg?url";
import mistralColor from "@lobehub/icons-static-svg/icons/mistral-color.svg?url";
import moonshot from "@lobehub/icons-static-svg/icons/moonshot.svg?url";
import ollama from "@lobehub/icons-static-svg/icons/ollama.svg?url";
import openai from "@lobehub/icons-static-svg/icons/openai.svg?url";
import openrouter from "@lobehub/icons-static-svg/icons/openrouter.svg?url";
import perplexityColor from "@lobehub/icons-static-svg/icons/perplexity-color.svg?url";
import togetherColor from "@lobehub/icons-static-svg/icons/together-color.svg?url";
import vercel from "@lobehub/icons-static-svg/icons/vercel.svg?url";
import vertexaiColor from "@lobehub/icons-static-svg/icons/vertexai-color.svg?url";
import xai from "@lobehub/icons-static-svg/icons/xai.svg?url";
import zai from "@lobehub/icons-static-svg/icons/zai.svg?url";

// Provider logos come from @lobehub/icons-static-svg (MIT), bundled as static
// assets. Marks remain the property of their owners and identify the service
// only. Single-colour marks are drawn as a mask so they follow the theme text
// colour; full-colour marks render as images.
const logos: Partial<Record<ProviderId, { url: string; color: boolean }>> = {
  ollama: { url: ollama, color: false },
  lmstudio: { url: lmstudio, color: false },
  openai: { url: openai, color: false },
  anthropic: { url: anthropic, color: false },
  google: { url: geminiColor, color: true },
  mistral: { url: mistralColor, color: true },
  xai: { url: xai, color: false },
  groq: { url: groq, color: false },
  deepseek: { url: deepseekColor, color: true },
  cerebras: { url: cerebrasColor, color: true },
  fireworks: { url: fireworksColor, color: true },
  togetherai: { url: togetherColor, color: true },
  perplexity: { url: perplexityColor, color: true },
  cohere: { url: cohereColor, color: true },
  deepinfra: { url: deepinfraColor, color: true },
  baseten: { url: baseten, color: false },
  huggingface: { url: huggingfaceColor, color: true },
  moonshotai: { url: moonshot, color: false },
  alibaba: { url: alibabacloudColor, color: true },
  minimax: { url: minimaxColor, color: true },
  zai: { url: zai, color: false },
  azure: { url: azureColor, color: true },
  "amazon-bedrock": { url: bedrockColor, color: true },
  "google-vertex": { url: vertexaiColor, color: true },
  "google-vertex-anthropic": { url: claudeColor, color: true },
  gateway: { url: vercel, color: false },
  openrouter: { url: openrouter, color: false },
};

// Fallback tiles for providers without an official mark.
const tones: Partial<Record<ProviderId, string>> = {
  llamacpp: "#a16207",
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
  const logo = logos[id];
  if (logo) {
    const glyph = Math.round(size * 0.62);
    return (
      <span
        className="provider-mark logo"
        aria-hidden="true"
        style={{ width: size, height: size }}
      >
        {logo.color ? (
          <img src={logo.url} alt="" width={glyph} height={glyph} />
        ) : (
          <span
            className="provider-glyph"
            style={{
              width: glyph,
              height: glyph,
              maskImage: `url("${logo.url}")`,
              WebkitMaskImage: `url("${logo.url}")`,
            }}
          />
        )}
      </span>
    );
  }
  return (
    <span
      className="provider-mark"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: tones[id] ?? "#3f3f46",
      }}
    >
      {monogram(provider(id).name)}
    </span>
  );
}
