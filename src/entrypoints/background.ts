import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { handleExtensionMessage } from "@/lib/extension-messaging";

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    sendResponse(handleExtensionMessage(message));
  });
});
