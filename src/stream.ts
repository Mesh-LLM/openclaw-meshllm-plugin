import type { StreamFn } from "openclaw/plugin-sdk/agent-core";
import type {
  AssistantMessage,
  Context,
  Model,
  StreamOptions,
  Usage,
} from "openclaw/plugin-sdk/llm";
import { createAssistantMessageEventStream } from "openclaw/plugin-sdk/llm";
import { createPlainTextToolCallCompatWrapper } from "openclaw/plugin-sdk/provider-stream-shared";
import { toMeshMessages } from "./messages.js";
import type { MeshRuntime } from "./runtime.js";

const EMPTY_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  total: 0,
};

function estimateTokens(text: string): number {
  return text ? Math.max(1, Math.ceil(text.length / 4)) : 0;
}

function buildUsage(context: Context, output: string): Usage {
  const input = estimateTokens(
    [context.systemPrompt, ...context.messages.map((message) => JSON.stringify(message))]
      .filter(Boolean)
      .join("\n"),
  );
  const outputTokens = estimateTokens(output);
  return {
    input,
    output: outputTokens,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: input + outputTokens,
    cost: EMPTY_COST,
  };
}

function buildMessage(params: {
  model: Model;
  context: Context;
  content: string;
  stopReason: AssistantMessage["stopReason"];
  errorMessage?: string;
}): AssistantMessage {
  return {
    role: "assistant",
    content: params.content ? [{ type: "text", text: params.content }] : [],
    api: params.model.api,
    provider: params.model.provider,
    model: params.model.id,
    usage: buildUsage(params.context, params.content),
    stopReason: params.stopReason,
    errorMessage: params.errorMessage,
    timestamp: Date.now(),
  };
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
}

function createRawMeshStreamFn(runtime: MeshRuntime): StreamFn {
  return (model: Model, context: Context, options?: StreamOptions) => {
    const stream = createAssistantMessageEventStream();
    queueMicrotask(() => {
      void (async () => {
        const startMessage = buildMessage({
          model,
          context,
          content: "",
          stopReason: "stop",
        });
        stream.push({ type: "start", partial: startMessage });
        try {
          const result = await runtime.chat(
            {
              model: model.id,
              messages: toMeshMessages(context),
            },
            {
              timeoutMs: options?.timeoutMs,
              signal: options?.signal,
            },
          );
          const message = buildMessage({
            model,
            context,
            content: result.content,
            stopReason: "stop",
          });
          if (result.content) {
            stream.push({ type: "text_start", contentIndex: 0, partial: startMessage });
            stream.push({ type: "text_delta", contentIndex: 0, delta: result.content });
            stream.push({
              type: "text_end",
              contentIndex: 0,
              content: result.content,
              partial: message,
            });
          }
          stream.push({ type: "done", reason: "stop", message });
        } catch (error) {
          const aborted = isAbort(error, options?.signal);
          const message = buildMessage({
            model,
            context,
            content: "",
            stopReason: aborted ? "aborted" : "error",
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          stream.push({
            type: "error",
            reason: aborted ? "aborted" : "error",
            error: message,
          });
        } finally {
          stream.end();
        }
      })();
    });
    return stream;
  };
}

export function createMeshStreamFn(runtime: MeshRuntime): StreamFn {
  return createPlainTextToolCallCompatWrapper(createRawMeshStreamFn(runtime));
}
