import { storage } from "wxt/utils/storage";

export const AUTO_REFRESH_DEFAULT = true;

const autoRefreshItem = storage.defineItem<unknown>("local:autoRefresh");

export async function readAutoRefresh(): Promise<boolean> {
  return parseAutoRefresh(await autoRefreshItem.getValue());
}

export async function saveAutoRefresh(enabled: boolean): Promise<void> {
  await autoRefreshItem.setValue(enabled);
}

export function watchAutoRefresh(
  callback: (enabled: boolean) => void,
): () => void {
  return autoRefreshItem.watch((value) => {
    callback(parseAutoRefresh(value));
  });
}

function parseAutoRefresh(value: unknown): boolean {
  return typeof value === "boolean" ? value : AUTO_REFRESH_DEFAULT;
}
