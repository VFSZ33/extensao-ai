import { afterEach, describe, expect, it, vi } from "vitest";

import { runExclusive } from "@/lib/exclusive-task";

function createTask(log: string[], name: string) {
  let finish: () => void = () => {};
  const task = vi.fn(
    () =>
      new Promise<string>((resolve, reject) => {
        log.push(name + " começou");
        finish = () => {
          log.push(name + " terminou");

          if (name === "falha") {
            reject(new Error(name));
          } else {
            resolve(name);
          }
        };
      }),
  );

  return { finish: () => finish(), task };
}

describe("Consulta única", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("só começa uma tarefa depois que a anterior termina, na ordem dos pedidos", async () => {
    const log: string[] = [];
    const first = createTask(log, "primeira");
    const second = createTask(log, "segunda");
    const firstResult = runExclusive("teste:ordem", first.task);
    const secondResult = runExclusive("teste:ordem", second.task);
    await vi.waitFor(() => expect(first.task).toHaveBeenCalled());
    expect(second.task).not.toHaveBeenCalled();
    first.finish();
    await expect(firstResult).resolves.toBe("primeira");
    await vi.waitFor(() => expect(second.task).toHaveBeenCalled());
    second.finish();
    await expect(secondResult).resolves.toBe("segunda");
    expect(log).toEqual([
      "primeira começou",
      "primeira terminou",
      "segunda começou",
      "segunda terminou",
    ]);
  });

  it("segue para a próxima tarefa quando a anterior falha", async () => {
    const log: string[] = [];
    const failing = createTask(log, "falha");
    const next = createTask(log, "seguinte");
    const failed = runExclusive("teste:falha", failing.task);
    const following = runExclusive("teste:falha", next.task);
    await vi.waitFor(() => expect(failing.task).toHaveBeenCalled());
    failing.finish();
    await expect(failed).rejects.toThrow("falha");
    await vi.waitFor(() => expect(next.task).toHaveBeenCalled());
    next.finish();
    await expect(following).resolves.toBe("seguinte");
  });

  it("não espera tarefas de outro nome", async () => {
    const log: string[] = [];
    const query = createTask(log, "consulta");
    const focus = createTask(log, "foco");
    void runExclusive("teste:consulta", query.task);
    const focused = runExclusive("teste:foco", focus.task);
    await vi.waitFor(() => expect(focus.task).toHaveBeenCalled());
    focus.finish();
    await expect(focused).resolves.toBe("foco");
    query.finish();
  });

  it("usa o bloqueio do navegador, compartilhado entre popup e painel lateral", async () => {
    const request = vi.fn((_name: string, callback: () => Promise<string>) =>
      callback(),
    );
    vi.stubGlobal("navigator", { ...navigator, locks: { request } });
    await expect(
      runExclusive("teste:navegador", async () => "pronto"),
    ).resolves.toBe("pronto");
    expect(request).toHaveBeenCalledWith(
      "teste:navegador",
      expect.any(Function),
    );
  });
});
