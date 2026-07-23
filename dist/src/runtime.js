function isRecord(value) {
    return Boolean(value && typeof value === "object");
}
async function loadMeshSdk() {
    const imported = (await import("@meshllm/sdk"));
    const fallback = isRecord(imported.default) ? imported.default : {};
    const module = { ...fallback, ...imported };
    if (typeof module.Client !== "function" ||
        typeof module.Node !== "function" ||
        typeof module.generateOwnerKeypairHex !== "function" ||
        typeof module.resolveNativeRuntime !== "function") {
        throw new Error("@meshllm/sdk did not expose the expected Node SDK surface");
    }
    return module;
}
function readMeshFailure(result) {
    for (const event of result.events) {
        if (!isRecord(event)) {
            continue;
        }
        if (event.type === "failed") {
            return typeof event.error === "string" ? event.error : "Mesh inference failed";
        }
        if (event.type === "timeout") {
            return "Mesh inference timed out";
        }
    }
    return undefined;
}
function abortError() {
    const error = new Error("Mesh inference was aborted");
    error.name = "AbortError";
    return error;
}
async function waitForInference(promise, signal) {
    if (!signal) {
        return await promise;
    }
    if (signal.aborted) {
        throw abortError();
    }
    return await new Promise((resolve, reject) => {
        const onAbort = () => reject(abortError());
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then((result) => {
            signal.removeEventListener("abort", onAbort);
            resolve(result);
        }, (error) => {
            signal.removeEventListener("abort", onAbort);
            reject(error);
        });
    });
}
export class MeshRuntime {
    #config;
    #logger;
    #sdkLoader;
    #handle;
    #node;
    #servedModel;
    #startPromise;
    constructor(config, logger, sdkLoader = loadMeshSdk) {
        this.#config = config;
        this.#logger = logger;
        this.#sdkLoader = sdkLoader;
    }
    async start() {
        if (this.#startPromise) {
            await this.#startPromise;
            return;
        }
        if (this.#handle) {
            return;
        }
        this.#startPromise = this.#startOnce().catch((error) => {
            this.#startPromise = undefined;
            throw error;
        });
        await this.#startPromise;
    }
    async #startOnce() {
        const inviteToken = this.#config.inviteToken;
        if (!inviteToken) {
            throw new Error("MeshLLM requires inviteToken in plugins.entries.meshllm.config or MESH_SDK_INVITE_TOKEN");
        }
        const sdk = await this.#sdkLoader();
        const ownerKeypairHex = this.#config.ownerKeypairHex ?? sdk.generateOwnerKeypairHex();
        if (!this.#config.ownerKeypairHex) {
            this.#logger.warn("MeshLLM generated an ephemeral owner keypair; configure ownerKeypairHex for a stable identity");
        }
        let handle;
        if (this.#config.mode === "node") {
            const nativeRuntime = await sdk.resolveNativeRuntime({
                ...this.#config.nativeRuntime,
                onProgress: (event) => {
                    if (event.finished) {
                        this.#logger.info(`MeshLLM native runtime download completed: ${event.nativeRuntimeId}`);
                    }
                },
            });
            this.#logger.info(`MeshLLM native runtime ready: ${nativeRuntime.nativeRuntimeId} (${nativeRuntime.flavor})`);
            const node = sdk.Node.create({
                ownerKeypairHex,
                inviteToken,
                cacheDir: this.#config.cacheDir,
                runtimeDir: this.#config.runtimeDir,
                servingEnabled: true,
            });
            this.#node = node;
            handle = node;
        }
        else {
            handle = sdk.Client.create({ ownerKeypairHex, inviteToken });
        }
        this.#handle = handle;
        try {
            await handle.start();
            if (this.#node && this.#config.modelRef) {
                await this.#loadConfiguredModel(this.#node, this.#config.modelRef);
            }
            const status = await handle.status();
            this.#logger.info(`MeshLLM ${this.#config.mode} started (${status.peerCount} peer${status.peerCount === 1 ? "" : "s"})`);
        }
        catch (error) {
            this.#handle = undefined;
            this.#node = undefined;
            await handle.stop().catch(() => undefined);
            throw error;
        }
    }
    async #loadConfiguredModel(node, modelRef) {
        if (this.#config.downloadModel) {
            this.#logger.info(`MeshLLM downloading model if needed: ${modelRef}`);
            await node.models.download(modelRef);
        }
        this.#servedModel = await node.serving.load(modelRef, {
            devicePolicy: this.#config.devicePolicy,
        });
        this.#logger.info(`MeshLLM serving model ${this.#servedModel.modelId} (${this.#servedModel.state.type})`);
    }
    async stop() {
        if (this.#startPromise) {
            await this.#startPromise.catch(() => undefined);
        }
        const handle = this.#handle;
        const node = this.#node;
        const servedModel = this.#servedModel;
        this.#handle = undefined;
        this.#node = undefined;
        this.#servedModel = undefined;
        this.#startPromise = undefined;
        if (!handle) {
            return;
        }
        if (node && servedModel) {
            const options = { drainTimeoutMs: this.#config.unloadDrainTimeoutMs };
            if (servedModel.instanceId) {
                await node.serving.unloadInstance(servedModel.instanceId, options).catch((error) => {
                    this.#logger.warn(`MeshLLM could not unload serving instance: ${String(error)}`);
                });
            }
            else {
                await node.serving.unloadModel(servedModel.modelId, options).catch((error) => {
                    this.#logger.warn(`MeshLLM could not unload serving model: ${String(error)}`);
                });
            }
        }
        await handle.stop();
        this.#logger.info("MeshLLM stopped");
    }
    async listModels() {
        await this.start();
        const handle = this.#requireHandle();
        const models = await handle.inference.listModels();
        if (!this.#node) {
            return models;
        }
        const serving = await this.#node.serving.status();
        const byId = new Map(serving.models.map((model) => [model.modelId, model]));
        return models.map((model) => {
            const served = byId.get(model.id);
            return {
                ...model,
                capabilities: served?.capabilities,
                contextLength: served?.contextLength,
            };
        });
    }
    async chat(request, options = {}) {
        await this.start();
        const handle = this.#requireHandle();
        const inferencePromise = handle.inference.chat(request, {
            timeoutMs: options.timeoutMs ?? this.#config.inferenceTimeoutMs,
        });
        const result = await waitForInference(inferencePromise, options.signal);
        const failure = readMeshFailure(result);
        if (failure) {
            throw new Error(failure);
        }
        return result;
    }
    async status() {
        await this.start();
        const handle = this.#requireHandle();
        const status = await handle.status();
        return {
            mode: this.#config.mode,
            ...status,
            serving: this.#node ? await this.#node.serving.status() : undefined,
        };
    }
    get config() {
        return this.#config;
    }
    #requireHandle() {
        if (!this.#handle) {
            throw new Error("MeshLLM runtime is not started");
        }
        return this.#handle;
    }
}
