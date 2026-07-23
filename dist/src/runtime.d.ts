import type { InferenceResult, Model, ModelCapabilities, ServingStatus } from "@meshllm/sdk";
import type { MeshPluginConfig } from "./config.js";
export type MeshLogger = {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error?: (message: string) => void;
};
export type MeshSdkModule = {
    Client: typeof import("@meshllm/sdk").Client;
    Node: typeof import("@meshllm/sdk").Node;
    generateOwnerKeypairHex: typeof import("@meshllm/sdk").generateOwnerKeypairHex;
    resolveNativeRuntime: typeof import("@meshllm/sdk").resolveNativeRuntime;
};
export type MeshDiscoveredModel = Model & {
    capabilities?: ModelCapabilities;
    contextLength?: number | null;
};
export type MeshRuntimeStatus = {
    mode: MeshPluginConfig["mode"];
    connected: boolean;
    peerCount: number;
    serving?: ServingStatus;
};
type MeshSdkLoader = () => Promise<MeshSdkModule>;
export declare class MeshRuntime {
    #private;
    constructor(config: MeshPluginConfig, logger: MeshLogger, sdkLoader?: MeshSdkLoader);
    start(): Promise<void>;
    stop(): Promise<void>;
    listModels(): Promise<MeshDiscoveredModel[]>;
    chat(request: {
        model: string;
        messages: Array<{
            role: string;
            content: string;
        }>;
    }, options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
    }): Promise<InferenceResult>;
    status(): Promise<MeshRuntimeStatus>;
    get config(): MeshPluginConfig;
}
export {};
