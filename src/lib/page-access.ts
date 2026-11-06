import { browser } from "wxt/browser";

export type PageAccess = "granted" | "missing" | "unsupported";

const REQUESTABLE_PROTOCOL = "https:";
const WEB_PROTOCOLS = ["http:", "https:"];

export function readOriginPattern(url: string): string | undefined {
  if (!URL.canParse(url)) {
    return undefined;
  }

  const { hostname, origin, protocol } = new URL(url);

  return protocol === REQUESTABLE_PROTOCOL && hostname
    ? origin + "/*"
    : undefined;
}

export async function readPageAccess(
  tabId: number,
  url: string,
): Promise<PageAccess> {
  const pattern = readOriginPattern(url);

  if (pattern && (await hasOriginPermission(pattern))) {
    return "granted";
  }

  if (isWebPage(url) && (await canAccessTab(tabId))) {
    return "granted";
  }

  return pattern ? "missing" : "unsupported";
}

export function requestPageAccess(url: string): Promise<boolean> {
  const pattern = readOriginPattern(url);

  return pattern
    ? browser.permissions.request({ origins: [pattern] })
    : Promise.resolve(false);
}

async function canAccessTab(tabId: number): Promise<boolean> {
  try {
    await browser.scripting.executeScript({
      func: confirmAccess,
      target: { tabId },
    });

    return true;
  } catch {
    return false;
  }
}

function confirmAccess(): boolean {
  return true;
}

async function hasOriginPermission(pattern: string): Promise<boolean> {
  try {
    return await browser.permissions.contains({ origins: [pattern] });
  } catch {
    return false;
  }
}

function isWebPage(url: string): boolean {
  return URL.canParse(url) && WEB_PROTOCOLS.includes(new URL(url).protocol);
}
