import { generateText, tool, type LanguageModel } from "ai";
import { z } from "zod";
import type { ModelCheck } from "@socius/contracts/providers";
import { classify } from "./errors.js";

const TIMEOUT_MS = 45000;

/**
 * Verifies a model with two minimal real calls: a short text reply, then a
 * tool-call request. Socius bots rely on tools for proposals and memory.
 */
export async function checkModel(
  model: LanguageModel,
  providerName: string,
): Promise<ModelCheck> {
  const started = Date.now();
  const checkedAt = () => new Date().toISOString();
  try {
    await generateText({
      model,
      prompt: "Reply with the single word OK.",
      maxOutputTokens: 512,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const failure = classify(error, providerName, {
      timedOut: (error as Error)?.name === "TimeoutError",
    });
    return {
      ok: false,
      checkedAt: checkedAt(),
      code: failure.code,
      message: failure.message,
      tools: null,
    };
  }
  const latencyMs = Date.now() - started;
  try {
    const result = await generateText({
      model,
      prompt:
        "Call the socius_check tool with value set to ok. Do not answer in text.",
      tools: {
        socius_check: tool({
          description: "Connectivity check. Call it exactly once.",
          inputSchema: z.object({ value: z.string() }),
        }),
      },
      maxOutputTokens: 512,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const called = result.toolCalls.some((c) => c.toolName === "socius_check");
    return {
      ok: true,
      checkedAt: checkedAt(),
      latencyMs,
      tools: called ? true : null,
      message: called
        ? "Model responded and can call tools."
        : "Model responded, but did not call the test tool. Tool support is unconfirmed.",
    };
  } catch (error) {
    const failure = classify(error, providerName);
    const unsupported = failure.code === "tools_unsupported";
    return {
      ok: true,
      checkedAt: checkedAt(),
      latencyMs,
      tools: unsupported ? false : null,
      ...(unsupported ? { code: failure.code } : {}),
      message: unsupported
        ? "Model responded, but does not support tool calling. Bots will run without tools on this model."
        : "Model responded. The tool-calling check failed, so tool support is unconfirmed.",
    };
  }
}
