import { AiModelInfo, AiToolResult } from './types';
export declare const aiClient: {
    isAvailable: () => Promise<boolean>;
    getModels: () => Promise<AiModelInfo[]>;
    sendMessage: (prompt: string, persona?: string, context?: string) => Promise<string>;
    runTool: (toolName: string, targetFile?: string, params?: any) => Promise<AiToolResult>;
};
