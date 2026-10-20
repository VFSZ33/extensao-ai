import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

import { PANEL_QUERY_KEY } from "@/lib/panel-query";
import { readPanelLeads } from "@/lib/panel-reader";

export default defineUnlistedScript(() => {
  const query: unknown = Reflect.get(globalThis, PANEL_QUERY_KEY);
  Reflect.deleteProperty(globalThis, PANEL_QUERY_KEY);

  return readPanelLeads(
    {
      fetch: (url, request) => fetch(url, request),
      now: () => Date.now(),
      readCookies: () => document.cookie,
      url: location.href,
      wait: (milliseconds) =>
        new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        }),
    },
    query,
  );
});
