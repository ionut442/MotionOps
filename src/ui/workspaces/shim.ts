import type { UiToPluginMessage } from "../../shared/messages";

export const createRequestId = (): string => `qwen-${Date.now().toString()}-${Math.random().toString(16).slice(2)}`;

export const sendToPlugin = (message: UiToPluginMessage): void => {
  void message;
};
