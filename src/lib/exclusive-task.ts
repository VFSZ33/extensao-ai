export const PAGE_COMMAND_LOCK = "scanner-de-leads:page-command";
export const PANEL_FOCUS_LOCK = "scanner-de-leads:panel-focus";
export const PANEL_QUERY_LOCK = "scanner-de-leads:panel-query";

const queues = new Map<string, Promise<void>>();

export function runExclusive<Result>(
  name: string,
  task: () => Promise<Result>,
): Promise<Result> {
  const run = () =>
    "locks" in navigator ? navigator.locks.request(name, task) : task();
  const result = (queues.get(name) ?? Promise.resolve()).then(run, run);
  queues.set(
    name,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );

  return result;
}
