import assert from "node:assert/strict";
import test from "node:test";
import { MeshRuntime } from "../src/runtime.js";
import { createMeshStreamFn } from "../src/stream.js";
async function collect(streamFn) {
    const stream = streamFn({
        id: "qwen",
        name: "Qwen",
        api: "meshllm",
        provider: "meshllm",
        baseUrl: "meshllm://node-sdk",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32768,
        maxTokens: 8192,
    }, {
        messages: [{ role: "user", content: "hello", timestamp: 1 }],
    }, {});
    const events = [];
    for await (const event of await stream) {
        events.push(event);
    }
    return events;
}
test("adapts unary Mesh output into OpenClaw text stream events", async () => {
    const events = await collect(createMeshStreamFn({
        async chat() {
            return {
                requestId: "req",
                content: "hello from mesh",
                events: [{ type: "completed" }],
            };
        },
    }));
    assert.deepEqual(events.map((event) => event.type), ["start", "text_start", "text_delta", "text_end", "done"]);
});
test("promotes a standalone bracketed tool request", async () => {
    const runtime = {
        async chat() {
            return {
                requestId: "req",
                content: '[tool:weather]{"city":"Sydney"}',
                events: [{ type: "completed" }],
            };
        },
    };
    const stream = createMeshStreamFn(runtime)({
        id: "qwen",
        name: "Qwen",
        api: "meshllm",
        provider: "meshllm",
        baseUrl: "meshllm://node-sdk",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32768,
        maxTokens: 8192,
    }, {
        messages: [{ role: "user", content: "weather", timestamp: 1 }],
        tools: [
            {
                name: "weather",
                description: "Get weather",
                parameters: { type: "object" },
            },
        ],
    }, {});
    const events = [];
    for await (const event of await stream) {
        events.push(event);
    }
    const done = events.find((event) => event.type === "done");
    assert.equal(done?.type, "done");
    if (done?.type === "done") {
        assert.equal(done.message.stopReason, "toolUse");
        const toolCall = done.message.content[0];
        assert.equal(toolCall?.type, "toolCall");
        if (toolCall?.type !== "toolCall") {
            return;
        }
        assert.match(toolCall.id, /^call_/);
        assert.deepEqual(toolCall, {
            type: "toolCall",
            id: toolCall.id,
            name: "weather",
            arguments: { city: "Sydney" },
            partialArgs: '{"city":"Sydney"}',
        });
    }
});
