import assert from "node:assert/strict";
import test from "node:test";
import { toMeshMessages } from "../src/messages.js";
test("projects system, tool, and tool-result context into Mesh role/content messages", () => {
    const messages = toMeshMessages({
        systemPrompt: "Be concise.",
        tools: [
            {
                name: "weather",
                description: "Get weather",
                parameters: {
                    type: "object",
                    properties: { city: { type: "string" } },
                },
            },
        ],
        messages: [
            { role: "user", content: "Weather?", timestamp: 1 },
            {
                role: "assistant",
                content: [
                    { type: "toolCall", id: "call-1", name: "weather", arguments: { city: "Sydney" } },
                ],
                api: "meshllm",
                provider: "meshllm",
                model: "qwen",
                usage: {
                    input: 1,
                    output: 1,
                    cacheRead: 0,
                    cacheWrite: 0,
                    totalTokens: 2,
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                },
                stopReason: "toolUse",
                timestamp: 2,
            },
            {
                role: "toolResult",
                toolCallId: "call-1",
                toolName: "weather",
                content: [{ type: "text", text: "Sunny" }],
                isError: false,
                timestamp: 3,
            },
        ],
    });
    assert.equal(messages[0]?.role, "system");
    assert.match(messages[0]?.content ?? "", /Available tools/);
    assert.deepEqual(messages.slice(1), [
        { role: "user", content: "Weather?" },
        { role: "assistant", content: '[tool:weather]{"city":"Sydney"}' },
        { role: "user", content: "Tool result for weather:\nSunny" },
    ]);
});
