import assert from "node:assert/strict";
import test from "node:test";
import { resolveMeshPluginConfig } from "../src/config.js";
import { MeshRuntime, type MeshSdkModule } from "../src/runtime.js";

function logger() {
  return {
    messages: [] as string[],
    info(message: string) {
      this.messages.push(message);
    },
    warn(message: string) {
      this.messages.push(message);
    },
  };
}

test("client mode starts once, lists models, chats, and stops", async () => {
  const calls: string[] = [];
  const handle = {
    inference: {
      async listModels() {
        return [{ id: "qwen", name: "Qwen" }];
      },
      async chat() {
        return { requestId: "req-1", content: "hello", events: [{ type: "completed" }] };
      },
      async responses() {
        throw new Error("unused");
      },
      async cancel() {},
    },
    async start() {
      calls.push("start");
    },
    async stop() {
      calls.push("stop");
    },
    async reconnect() {},
    async status() {
      return { connected: true, peerCount: 2 };
    },
  };
  const sdk = {
    Client: { create: () => handle },
    Node: {
      create: () => {
        throw new Error("unexpected node");
      },
    },
    generateOwnerKeypairHex: () => "generated-owner",
    resolveNativeRuntime: async () => {
      throw new Error("unexpected runtime");
    },
  } as unknown as MeshSdkModule;
  const runtime = new MeshRuntime(
    resolveMeshPluginConfig({ inviteToken: "invite" }, {}),
    logger(),
    async () => sdk,
  );

  assert.deepEqual(await runtime.listModels(), [{ id: "qwen", name: "Qwen" }]);
  assert.equal(
    (
      await runtime.chat({
        model: "qwen",
        messages: [{ role: "user", content: "hi" }],
      })
    ).content,
    "hello",
  );
  await runtime.start();
  await runtime.stop();
  assert.deepEqual(calls, ["start", "stop"]);
});

test("node mode resolves runtime, downloads and loads a model, then unloads it", async () => {
  const calls: string[] = [];
  const node = {
    inference: {
      async listModels() {
        return [{ id: "served-qwen", name: "Served Qwen" }];
      },
      async chat() {
        return { requestId: "req-1", content: "ok", events: [{ type: "completed" }] };
      },
      async responses() {
        throw new Error("unused");
      },
      async cancel() {},
    },
    models: {
      async recommended() {
        return [];
      },
      async search() {
        return [];
      },
      async show() {
        throw new Error("unused");
      },
      async installed() {
        return [];
      },
      async download(modelRef: string) {
        calls.push(`download:${modelRef}`);
        return { modelRef, paths: [] };
      },
    },
    serving: {
      async status() {
        return { enabled: true, models: [] };
      },
      async load(modelRef: string) {
        calls.push(`load:${modelRef}`);
        return {
          modelRef,
          modelId: "served-qwen",
          instanceId: "instance-1",
          state: { type: "Ready" as const },
          capabilities: {
            multimodal: false,
            vision: { type: "None" as const },
            audio: { type: "None" as const },
            reasoning: { type: "Supported" as const },
            toolUse: { type: "Likely" as const },
            moe: false,
          },
        };
      },
      async unload() {},
      async unloadModel() {},
      async unloadInstance(instanceId: string) {
        calls.push(`unload:${instanceId}`);
      },
    },
    async start() {
      calls.push("start");
    },
    async stop() {
      calls.push("stop");
    },
    async reconnect() {},
    async status() {
      return { connected: true, peerCount: 1 };
    },
    async startConsole() {
      throw new Error("unused");
    },
  };
  const sdk = {
    Client: {
      create: () => {
        throw new Error("unexpected client");
      },
    },
    Node: { create: () => node },
    generateOwnerKeypairHex: () => "owner",
    async resolveNativeRuntime() {
      calls.push("runtime");
      return {
        meshVersion: "0.68.0",
        nativeRuntimeId: "darwin-metal",
        flavor: "metal",
        path: "/runtime",
      };
    },
  } as unknown as MeshSdkModule;
  const runtime = new MeshRuntime(
    resolveMeshPluginConfig({ mode: "node", inviteToken: "invite", modelRef: "repo/qwen:Q4" }, {}),
    logger(),
    async () => sdk,
  );

  await runtime.start();
  await runtime.stop();
  assert.deepEqual(calls, [
    "runtime",
    "start",
    "download:repo/qwen:Q4",
    "load:repo/qwen:Q4",
    "unload:instance-1",
    "stop",
  ]);
});

test("surfaces Mesh failed events as errors", async () => {
  const handle = {
    inference: {
      async listModels() {
        return [];
      },
      async chat() {
        return {
          requestId: "req-1",
          content: "",
          events: [{ type: "failed", error: "no route" }],
        };
      },
      async responses() {
        throw new Error("unused");
      },
      async cancel() {},
    },
    async start() {},
    async stop() {},
    async reconnect() {},
    async status() {
      return { connected: true, peerCount: 0 };
    },
  };
  const sdk = {
    Client: { create: () => handle },
    Node: {
      create: () => {
        throw new Error("unexpected");
      },
    },
    generateOwnerKeypairHex: () => "owner",
    resolveNativeRuntime: async () => {
      throw new Error("unexpected");
    },
  } as unknown as MeshSdkModule;
  const runtime = new MeshRuntime(
    resolveMeshPluginConfig({ inviteToken: "invite" }, {}),
    logger(),
    async () => sdk,
  );

  await assert.rejects(
    runtime.chat({ model: "qwen", messages: [{ role: "user", content: "hi" }] }),
    /no route/,
  );
});

test("returns an abort without waiting for the unary Mesh call to finish", async () => {
  const handle = {
    inference: {
      async listModels() {
        return [];
      },
      async chat() {
        return await new Promise<never>(() => undefined);
      },
      async responses() {
        throw new Error("unused");
      },
      async cancel() {},
    },
    async start() {},
    async stop() {},
    async reconnect() {},
    async status() {
      return { connected: true, peerCount: 1 };
    },
  };
  const sdk = {
    Client: { create: () => handle },
    Node: {
      create: () => {
        throw new Error("unexpected");
      },
    },
    generateOwnerKeypairHex: () => "owner",
    resolveNativeRuntime: async () => {
      throw new Error("unexpected");
    },
  } as unknown as MeshSdkModule;
  const runtime = new MeshRuntime(
    resolveMeshPluginConfig({ inviteToken: "invite" }, {}),
    logger(),
    async () => sdk,
  );
  const abort = new AbortController();
  const result = runtime.chat(
    { model: "qwen", messages: [{ role: "user", content: "hi" }] },
    { signal: abort.signal },
  );
  abort.abort();

  await assert.rejects(result, { name: "AbortError" });
});
