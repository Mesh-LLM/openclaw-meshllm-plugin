function stringifyTextContent(content) {
    if (typeof content === "string") {
        return content;
    }
    return content
        .map((part) => {
        if (part.type === "text") {
            return part.text;
        }
        if (part.type === "image") {
            return `[image omitted: ${part.mimeType}]`;
        }
        if (part.type === "thinking") {
            return part.thinking;
        }
        return `[tool:${part.name}]${JSON.stringify(part.arguments)}`;
    })
        .filter(Boolean)
        .join("\n");
}
function toolInstructions(tools) {
    if (!tools?.length) {
        return undefined;
    }
    const definitions = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
    }));
    return [
        "You can call the tools listed below.",
        "To call one tool, respond with only this exact plain-text form:",
        '[tool:TOOL_NAME]{"argument":"value"}',
        "Do not wrap the tool call in Markdown. Use an allowed tool name and a JSON object.",
        `Available tools: ${JSON.stringify(definitions)}`,
    ].join("\n");
}
function convertMessage(message) {
    if (message.role === "toolResult") {
        return {
            role: "user",
            content: `Tool result for ${message.toolName}${message.isError ? " (error)" : ""}:\n${stringifyTextContent(message.content)}`,
        };
    }
    return {
        role: message.role,
        content: stringifyTextContent(message.content),
    };
}
export function toMeshMessages(context) {
    const systemParts = [context.systemPrompt, toolInstructions(context.tools)].filter((part) => Boolean(part?.trim()));
    const messages = context.messages.map(convertMessage);
    if (systemParts.length > 0) {
        messages.unshift({ role: "system", content: systemParts.join("\n\n") });
    }
    return messages;
}
