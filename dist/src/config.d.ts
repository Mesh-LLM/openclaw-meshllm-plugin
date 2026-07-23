import type { DevicePolicy, NativeRuntimeResolveOptions } from "@meshllm/sdk";
export type MeshMode = "client" | "node";
export type MeshPluginConfig = {
    mode: MeshMode;
    inviteToken?: string;
    ownerKeypairHex?: string;
    cacheDir?: string;
    runtimeDir?: string;
    modelRef?: string;
    downloadModel: boolean;
    devicePolicy: DevicePolicy;
    inferenceTimeoutMs: number;
    contextWindow: number;
    maxTokens: number;
    unloadDrainTimeoutMs: number;
    nativeRuntime: NativeRuntimeResolveOptions;
};
export declare function resolveMeshPluginConfig(value: unknown, env?: NodeJS.ProcessEnv): MeshPluginConfig;
