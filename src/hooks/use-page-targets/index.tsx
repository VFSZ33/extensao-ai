import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

import { getActiveTab } from "@/lib/active-tab";
import { type PageAccess, readPageAccess } from "@/lib/page-access";
import { isPanelUrl } from "@/lib/panel-session";

export type PageTarget = {
  access: PageAccess;
  kind: "page" | "panel";
  revision: number;
  tabId: number;
  url: string;
};

export type PageTargets = {
  current: PageTarget | undefined;
  page: PageTarget | undefined;
  panel: PageTarget | undefined;
  status: "error" | "loading" | "ready";
};

const LOADING_TARGETS: PageTargets = {
  current: undefined,
  page: undefined,
  panel: undefined,
  status: "loading",
};

export function usePageTargets(enabled: boolean): PageTargets {
  const [targets, setTargets] = useState(LOADING_TARGETS);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let active = true;
    let currentTabId: number | undefined;
    let request = 0;
    const revisions = new Map<number, number>();

    async function refresh() {
      request += 1;
      const current = request;

      try {
        const tab = await getActiveTab();
        currentTabId = tab.id;
        const access = await readPageAccess(tab.id, tab.url);

        if (active && current === request) {
          setTargets((previous) =>
            mergeTarget(previous, {
              access,
              kind: isPanelUrl(tab.url) ? "panel" : "page",
              revision: revisions.get(tab.id) ?? 0,
              tabId: tab.id,
              url: tab.url,
            }),
          );
        }
      } catch {
        if (active && current === request) {
          setTargets((previous) => ({
            ...previous,
            current: undefined,
            status: "error",
          }));
        }
      }
    }

    function handleActivated() {
      void refresh();
    }

    function handlePermissionsChanged() {
      void refresh();
    }

    function handleUpdated(
      tabId: number,
      change: { status?: string; url?: string },
    ) {
      if (change.url === undefined && change.status !== "complete") {
        return;
      }

      revisions.set(tabId, (revisions.get(tabId) ?? 0) + 1);

      if (tabId === currentTabId) {
        void refresh();
      }
    }

    browser.tabs.onActivated.addListener(handleActivated);
    browser.tabs.onUpdated.addListener(handleUpdated);
    browser.permissions.onAdded.addListener(handlePermissionsChanged);
    browser.permissions.onRemoved.addListener(handlePermissionsChanged);
    void refresh();

    return () => {
      active = false;
      browser.tabs.onActivated.removeListener(handleActivated);
      browser.tabs.onUpdated.removeListener(handleUpdated);
      browser.permissions.onAdded.removeListener(handlePermissionsChanged);
      browser.permissions.onRemoved.removeListener(handlePermissionsChanged);
    };
  }, [enabled]);

  return targets;
}

function isSameTarget(
  first: PageTarget | undefined,
  second: PageTarget,
): boolean {
  return (
    first !== undefined &&
    first.access === second.access &&
    first.kind === second.kind &&
    first.revision === second.revision &&
    first.tabId === second.tabId &&
    first.url === second.url
  );
}

function mergeTarget(previous: PageTargets, target: PageTarget): PageTargets {
  if (previous.status === "ready" && isSameTarget(previous.current, target)) {
    return previous;
  }

  const granted = target.access === "granted";

  return {
    current: target,
    page: granted && target.kind === "page" ? target : previous.page,
    panel: granted && target.kind === "panel" ? target : previous.panel,
    status: "ready",
  };
}
