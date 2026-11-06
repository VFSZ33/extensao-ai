import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import {
  readAutoRefresh,
  saveAutoRefresh,
  watchAutoRefresh,
} from "@/lib/preferences";

describe("Preferência de atualização automática", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("vem ativada sem gravar nada", async () => {
    await expect(readAutoRefresh()).resolves.toBe(true);
    await expect(fakeBrowser.storage.local.get(null)).resolves.toEqual({});
  });

  it("guarda a escolha no armazenamento local", async () => {
    await saveAutoRefresh(false);
    await expect(readAutoRefresh()).resolves.toBe(false);
    await expect(fakeBrowser.storage.local.get(null)).resolves.toEqual({
      autoRefresh: false,
    });
    await saveAutoRefresh(true);
    await expect(readAutoRefresh()).resolves.toBe(true);
  });

  it("volta ao padrão quando o valor gravado é inválido", async () => {
    await fakeBrowser.storage.local.set({ autoRefresh: "não" });
    await expect(readAutoRefresh()).resolves.toBe(true);
  });

  it("avisa a mudança feita em outra tela da extensão", async () => {
    const callback = vi.fn();
    const unwatch = watchAutoRefresh(callback);
    await saveAutoRefresh(false);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(false));
    unwatch();
    await saveAutoRefresh(true);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
