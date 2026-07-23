import assert from "node:assert/strict";
import test from "node:test";
import { resolveMeshPluginConfig } from "../src/config.js";
test("resolves client defaults and official Mesh SDK environment variables", () => {
    const config = resolveMeshPluginConfig({}, {
        MESH_SDK_INVITE_TOKEN: "invite",
        MESH_SDK_OWNER_KEYPAIR_HEX: "owner",
    });
    assert.equal(config.mode, "client");
    assert.equal(config.inviteToken, "invite");
    assert.equal(config.ownerKeypairHex, "owner");
    assert.equal(config.inferenceTimeoutMs, 120_000);
    assert.equal(config.nativeRuntime.allowDownload, false);
});
test("resolves node serving options", () => {
    const config = resolveMeshPluginConfig({
        mode: "node",
        inviteToken: "invite",
        modelRef: "repo/model:Q4_K_M",
        devicePolicy: { gpu: ["0", "1"] },
        nativeRuntime: {
            artifactDir: "/runtime",
            allowDownload: true,
            verificationPolicy: "require_checksum_and_signature",
        },
    }, {});
    assert.equal(config.mode, "node");
    assert.equal(config.modelRef, "repo/model:Q4_K_M");
    assert.deepEqual(config.devicePolicy, { gpu: ["0", "1"] });
    assert.equal(config.nativeRuntime.artifactDir, "/runtime");
    assert.equal(config.nativeRuntime.allowDownload, true);
});
test("rejects invalid device policy", () => {
    assert.throws(() => resolveMeshPluginConfig({ devicePolicy: { gpu: [] } }, {}), /devicePolicy/);
});
