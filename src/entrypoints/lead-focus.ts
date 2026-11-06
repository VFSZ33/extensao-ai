import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

import { LEAD_FOCUS_KEY, runLeadFocus } from "@/lib/lead-focus";

export default defineUnlistedScript(() => {
  const command: unknown = Reflect.get(globalThis, LEAD_FOCUS_KEY);
  Reflect.deleteProperty(globalThis, LEAD_FOCUS_KEY);

  return runLeadFocus(command, {
    document,
    location,
    now: () => Date.now(),
    reduceMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    schedule: (callback, milliseconds) => {
      setTimeout(callback, milliseconds);
    },
    wait: (milliseconds) =>
      new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
      }),
  });
});
