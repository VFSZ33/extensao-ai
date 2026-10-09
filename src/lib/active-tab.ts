import { browser } from "wxt/browser";

export type ActiveTab = { id: number; url: string };

export async function getActiveTab(): Promise<ActiveTab> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  if (tab?.id === undefined) {
    throw new Error("Não foi possível identificar a aba ativa.");
  }

  return { id: tab.id, url: tab.url ?? "" };
}
