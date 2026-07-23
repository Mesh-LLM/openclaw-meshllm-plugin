# OpenClaw MeshLLM

[![CI](https://github.com/Mesh-LLM/openclaw-meshllm/actions/workflows/ci.yml/badge.svg)](https://github.com/Mesh-LLM/openclaw-meshllm/actions/workflows/ci.yml)

Standalone OpenClaw model-provider plugin for the MeshLLM Node SDK.

The plugin has two modes:

- `client`: join a Mesh and use its advertised models for OpenClaw inference.
- `node`: do the same while also loading a local model and serving it into the Mesh.

## Current SDK constraints

MeshLLM `0.68.0` exposes unary `inference.chat()` calls. OpenClaw therefore
receives each answer as one text chunk rather than token-by-token streaming.
The SDK also accepts role/content messages but not native tool definitions. This
plugin adds a plain-text tool-call protocol and uses OpenClaw's public tool-call
repair wrapper so compatible models can still call OpenClaw tools.

The SDK returns a request ID only after the unary call completes. An OpenClaw
abort therefore closes the local response stream promptly, but this SDK version
cannot forward that abort to an already-running Mesh request.

The `@meshllm/sdk` package is not currently published on npm. This checkout uses
the sibling source package at `../mesh-llm/sdk/node`.

## Build

Build the Mesh Node native addon first:

```bash
cd ../mesh-llm/sdk/node
npm run build:native
```

Then build and test the plugin:

```bash
cd ../../../openclaw-meshllm
npm install
npm test
```

## Client mode

Add the local plugin to `openclaw.json`:

```json5
{
  plugins: {
    load: {
      paths: ["/absolute/path/to/openclaw-meshllm"],
    },
    entries: {
      meshllm: {
        enabled: true,
        config: {
          mode: "client",
          inviteToken: "your-public-or-private-mesh-invite",
          ownerKeypairHex: "your-stable-owner-keypair-hex",
        },
      },
    },
  },
}
```

The plugin also understands the Mesh SDK's existing environment variables:

```bash
export MESH_SDK_INVITE_TOKEN='...'
export MESH_SDK_OWNER_KEYPAIR_HEX='...'
```

Restart the Gateway, inspect the plugin, and list Mesh models:

```bash
openclaw gateway restart
openclaw plugins inspect meshllm --runtime --json
openclaw models list --provider meshllm
```

Then set the desired `meshllm/<model-id>` as the agent's primary model using
your normal OpenClaw model configuration flow.

If `ownerKeypairHex` is omitted, the plugin generates an ephemeral keypair on
each Gateway start. Configure a stable keypair for a stable Mesh identity.

## Serving-node mode

Node mode resolves a native runtime, starts a serving-enabled Mesh node,
optionally downloads the configured model, and loads it:

```json5
{
  plugins: {
    load: {
      paths: ["/absolute/path/to/openclaw-meshllm"],
    },
    entries: {
      meshllm: {
        enabled: true,
        config: {
          mode: "node",
          inviteToken: "your-public-or-private-mesh-invite",
          ownerKeypairHex: "your-stable-owner-keypair-hex",
          modelRef: "Qwen2.5-3B-Instruct-Q4_K_M",
          downloadModel: true,
          devicePolicy: "auto",
          nativeRuntime: {
            artifactDir: "/path/to/meshllm-native-runtime-darwin-aarch64-metal",
            allowDownload: false,
          },
        },
      },
    },
  },
}
```

To let the SDK download its recommended native runtime instead:

```json5
nativeRuntime: {
  allowDownload: true,
}
```

The serving instance is drained and unloaded when OpenClaw stops the plugin,
then the Mesh node is stopped.

## Configuration

| Field                  | Default                      | Meaning                                                  |
| ---------------------- | ---------------------------- | -------------------------------------------------------- |
| `mode`                 | `"client"`                   | Join only, or join and serve                             |
| `inviteToken`          | `MESH_SDK_INVITE_TOKEN`      | Public or private Mesh invite                            |
| `ownerKeypairHex`      | `MESH_SDK_OWNER_KEYPAIR_HEX` | Stable Mesh identity; generated ephemerally if omitted   |
| `cacheDir`             | `MESH_SDK_CACHE_DIR`         | Mesh model/cache directory                               |
| `runtimeDir`           | `MESH_SDK_RUNTIME_DIR`       | Mesh runtime working directory                           |
| `modelRef`             | `MESH_SDK_MODEL_REF`         | Model to download/load in node mode                      |
| `downloadModel`        | `true`                       | Download the model before loading it                     |
| `devicePolicy`         | `"auto"`                     | `"auto"`, `"cpu"`, `"gpu"`, or `{ gpu: string[] }`       |
| `inferenceTimeoutMs`   | `120000`                     | Mesh SDK chat timeout                                    |
| `contextWindow`        | `32768`                      | Fallback context size when discovery does not report one |
| `maxTokens`            | `8192`                       | OpenClaw catalog output-token limit                      |
| `unloadDrainTimeoutMs` | `10000`                      | Node shutdown drain time                                 |
| `nativeRuntime`        | download disabled            | Mesh native-runtime resolver options                     |

`MESHLLM_NATIVE_RUNTIME_ARTIFACT_DIR`,
`MESH_SDK_RUNTIME_ALLOW_DOWNLOAD`, and `MESH_SDK_SKIP_DOWNLOAD` are also
honored.
