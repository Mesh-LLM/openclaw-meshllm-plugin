export const MESH_PROVIDER_ID = "meshllm";
// OpenClaw's catalog schema requires a known API family even when createStreamFn
// replaces the transport. The Mesh adapter projects OpenAI-style chat turns.
export const MESH_API_ID = "openai-completions";
export const MESH_AUTH_MARKER = "meshllm-node-sdk";
function supportsCapability(capability) {
    return capability?.type === "Supported" || capability?.type === "Likely";
}
export function toModelDefinition(model, config) {
    const capabilities = model.capabilities;
    return {
        id: model.id,
        name: model.name || model.id,
        reasoning: supportsCapability(capabilities?.reasoning),
        // The 0.68 Node SDK chat request accepts string content only.
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: model.contextLength ?? config.contextWindow,
        maxTokens: config.maxTokens,
    };
}
export function buildMeshProviderConfig(models, config) {
    return {
        baseUrl: "meshllm://node-sdk",
        apiKey: MESH_AUTH_MARKER,
        api: MESH_API_ID,
        models: models.map((model) => toModelDefinition(model, config)),
    };
}
export function buildDynamicMeshModel(modelId, config) {
    return {
        id: modelId,
        name: modelId,
        provider: MESH_PROVIDER_ID,
        api: MESH_API_ID,
        baseUrl: "meshllm://node-sdk",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: config.contextWindow,
        maxTokens: config.maxTokens,
    };
}
