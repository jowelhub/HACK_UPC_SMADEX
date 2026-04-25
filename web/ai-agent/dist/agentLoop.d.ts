import { type GoogleGenAI } from '@google/genai';
export type ClientChatMessage = {
    role: 'user' | 'model' | 'assistant';
    text: string;
};
export declare function createCopilotReadable(client: GoogleGenAI, options: {
    model: string;
    systemInstruction: string;
    messages: ClientChatMessage[];
}): ReadableStream<Uint8Array<ArrayBufferLike>>;
//# sourceMappingURL=agentLoop.d.ts.map