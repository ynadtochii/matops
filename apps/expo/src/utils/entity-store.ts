import * as SecureStore from "expo-secure-store";

const KEY = "matops.activeEntity";

export const getActiveEntity = (): string | null => SecureStore.getItem(KEY);

export const setActiveEntity = (entityId: string): void =>
  SecureStore.setItem(KEY, entityId);

export const clearActiveEntity = (): Promise<void> =>
  SecureStore.deleteItemAsync(KEY);
