import type { Context } from "openclaw/plugin-sdk/llm";
export type MeshChatMessage = {
    role: string;
    content: string;
};
export declare function toMeshMessages(context: Context): MeshChatMessage[];
