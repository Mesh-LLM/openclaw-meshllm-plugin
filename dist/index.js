import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { resolveMeshPluginConfig } from "./src/config.js";
import { buildDynamicMeshModel, buildMeshProviderConfig, MESH_API_ID, MESH_AUTH_MARKER, MESH_PROVIDER_ID, toModelDefinition, } from "./src/provider.js";
import { MeshRuntime } from "./src/runtime.js";
import { createMeshStreamFn } from "./src/stream.js";
const plugin = definePluginEntry({
    id: MESH_PROVIDER_ID,
    name: "MeshLLM",
    description: "MeshLLM client and serving-node provider",
    register(api) {
        const config = resolveMeshPluginConfig(api.pluginConfig);
        const runtime = new MeshRuntime(config, api.logger);
        const streamFn = createMeshStreamFn(runtime);
        api.registerService({
            id: "meshllm-runtime",
            start: async () => await runtime.start(),
            stop: async () => await runtime.stop(),
        });
        api.registerProvider({
            id: MESH_PROVIDER_ID,
            label: "MeshLLM",
            envVars: ["MESH_SDK_INVITE_TOKEN", "MESH_SDK_OWNER_KEYPAIR_HEX"],
            auth: [],
            catalog: {
                order: "late",
                run: async () => {
                    const models = await runtime.listModels();
                    return models.length ? { provider: buildMeshProviderConfig(models, config) } : null;
                },
            },
            resolveSyntheticAuth: () => ({
                apiKey: MESH_AUTH_MARKER,
                source: "MeshLLM Node SDK",
                mode: "api-key",
            }),
            resolveDynamicModel: ({ modelId }) => buildDynamicMeshModel(modelId, config),
            createStreamFn: ({ model }) => (model.api === MESH_API_ID ? streamFn : undefined),
            resolveReasoningOutputMode: () => "tagged",
            buildMissingAuthMessage: () => "MeshLLM uses an invite token, not an API key. Configure plugins.entries.meshllm.config.inviteToken.",
        });
        api.registerModelCatalogProvider({
            provider: MESH_PROVIDER_ID,
            kinds: ["text"],
            liveCatalog: async () => (await runtime.listModels()).map((model) => ({
                kind: "text",
                provider: MESH_PROVIDER_ID,
                model: model.id,
                label: model.name || model.id,
                source: "live",
                ...toModelDefinition(model, config),
            })),
        });
    },
});
export default plugin;
