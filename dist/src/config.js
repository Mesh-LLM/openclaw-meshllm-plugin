function asRecord(value, label) {
    if (value === undefined) {
        return {};
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} must be an object`);
    }
    return value;
}
function optionalString(value, label) {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${label} must be a non-empty string`);
    }
    return value.trim();
}
function optionalBoolean(value, label) {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "boolean") {
        throw new Error(`${label} must be a boolean`);
    }
    return value;
}
function positiveInteger(value, label, fallback, minimum) {
    if (value === undefined) {
        return fallback;
    }
    if (!Number.isInteger(value) || value < minimum) {
        throw new Error(`${label} must be an integer greater than or equal to ${minimum}`);
    }
    return value;
}
function stringArray(value, label) {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
        throw new Error(`${label} must be an array of non-empty strings`);
    }
    return value.map((entry) => entry.trim());
}
function readDevicePolicy(value) {
    if (value === undefined) {
        return "auto";
    }
    if (value === "auto" || value === "cpu" || value === "gpu") {
        return value;
    }
    const record = asRecord(value, "devicePolicy");
    const gpu = stringArray(record.gpu, "devicePolicy.gpu");
    if (!gpu?.length) {
        throw new Error('devicePolicy must be "auto", "cpu", "gpu", or { gpu: string[] }');
    }
    return { gpu };
}
function readNativeRuntime(value, env) {
    const record = asRecord(value, "nativeRuntime");
    const verificationPolicy = optionalString(record.verificationPolicy, "nativeRuntime.verificationPolicy");
    if (verificationPolicy !== undefined &&
        verificationPolicy !== "require_checksum" &&
        verificationPolicy !== "require_checksum_and_signature") {
        throw new Error("nativeRuntime.verificationPolicy must be require_checksum or require_checksum_and_signature");
    }
    return {
        artifactDir: optionalString(record.artifactDir, "nativeRuntime.artifactDir") ??
            optionalString(env.MESHLLM_NATIVE_RUNTIME_ARTIFACT_DIR, "MESHLLM_NATIVE_RUNTIME_ARTIFACT_DIR"),
        searchDirs: stringArray(record.searchDirs, "nativeRuntime.searchDirs"),
        cacheDir: optionalString(record.cacheDir, "nativeRuntime.cacheDir"),
        selection: optionalString(record.selection, "nativeRuntime.selection"),
        manifestPath: optionalString(record.manifestPath, "nativeRuntime.manifestPath"),
        manifestUrl: optionalString(record.manifestUrl, "nativeRuntime.manifestUrl"),
        allowDownload: optionalBoolean(record.allowDownload, "nativeRuntime.allowDownload") ??
            env.MESH_SDK_RUNTIME_ALLOW_DOWNLOAD === "1",
        verificationPolicy: verificationPolicy,
    };
}
export function resolveMeshPluginConfig(value, env = process.env) {
    const record = asRecord(value, "MeshLLM plugin config");
    const mode = record.mode ?? "client";
    if (mode !== "client" && mode !== "node") {
        throw new Error('mode must be either "client" or "node"');
    }
    return {
        mode,
        inviteToken: optionalString(record.inviteToken, "inviteToken") ??
            optionalString(env.MESH_SDK_INVITE_TOKEN, "MESH_SDK_INVITE_TOKEN"),
        ownerKeypairHex: optionalString(record.ownerKeypairHex, "ownerKeypairHex") ??
            optionalString(env.MESH_SDK_OWNER_KEYPAIR_HEX, "MESH_SDK_OWNER_KEYPAIR_HEX"),
        cacheDir: optionalString(record.cacheDir, "cacheDir") ??
            optionalString(env.MESH_SDK_CACHE_DIR, "MESH_SDK_CACHE_DIR"),
        runtimeDir: optionalString(record.runtimeDir, "runtimeDir") ??
            optionalString(env.MESH_SDK_RUNTIME_DIR, "MESH_SDK_RUNTIME_DIR"),
        modelRef: optionalString(record.modelRef, "modelRef") ??
            optionalString(env.MESH_SDK_MODEL_REF, "MESH_SDK_MODEL_REF"),
        downloadModel: optionalBoolean(record.downloadModel, "downloadModel") ?? env.MESH_SDK_SKIP_DOWNLOAD !== "1",
        devicePolicy: readDevicePolicy(record.devicePolicy),
        inferenceTimeoutMs: positiveInteger(record.inferenceTimeoutMs, "inferenceTimeoutMs", 120_000, 1_000),
        contextWindow: positiveInteger(record.contextWindow, "contextWindow", 32_768, 1_024),
        maxTokens: positiveInteger(record.maxTokens, "maxTokens", 8_192, 1),
        unloadDrainTimeoutMs: positiveInteger(record.unloadDrainTimeoutMs, "unloadDrainTimeoutMs", 10_000, 0),
        nativeRuntime: readNativeRuntime(record.nativeRuntime, env),
    };
}
