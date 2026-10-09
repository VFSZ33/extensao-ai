import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

import { readPanelLeads } from "@/lib/panel-reader";

export default defineUnlistedScript(() =>
  readPanelLeads({
    fetch: (url, request) => fetch(url, request),
    now: () => Date.now(),
    readCookies: () => document.cookie,
    url: location.href,
  }),
);
