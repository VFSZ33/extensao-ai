import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

import { formDefinitions } from "@/lib/form-definitions";
import { runPageCommand } from "@/lib/form-filler";
import { PAGE_COMMAND_KEY } from "@/lib/page-command";

export default defineUnlistedScript(() => {
  const command: unknown = Reflect.get(globalThis, PAGE_COMMAND_KEY);
  Reflect.deleteProperty(globalThis, PAGE_COMMAND_KEY);

  return runPageCommand(command, document, formDefinitions);
});
