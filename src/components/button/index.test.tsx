import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button, type ButtonProps } from "@/components/button";

describe("Button", () => {
  it("render callback recebe props e estado e preserva ativação e loading", async () => {
    const onClick = vi.fn();
    const renderState = vi.fn();
    const user = userEvent.setup();
    const renderCallback: ButtonProps["render"] = (props, state) => {
      renderState(state);
      return <button {...props} data-custom="callback" />;
    };
    const { rerender } = render(
      <Button className="px-8" onClick={onClick} render={renderCallback}>
        Salvar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Salvar" });
    expect(renderState).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: false }),
    );
    expect(button).toHaveAttribute("data-custom", "callback");
    expect(button).toHaveClass("px-8");
    expect(button).toHaveAttribute("type", "button");
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();

    rerender(
      <Button
        className="px-8"
        loading
        loadingLabel="Salvando…"
        onClick={onClick}
        render={renderCallback}
      >
        Salvar
      </Button>,
    );
    expect(renderState).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: true }),
    );
    expect(button).toHaveAccessibleName("Salvando…");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("data-custom", "callback");
    expect(button).toHaveClass("px-8");
    await user.click(button);
    await user.keyboard("{Enter} ");
    expect(onClick).toHaveBeenCalledOnce();
  });
  it("preserva semântica, props, ref e ativação por clique e teclado", async () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const user = userEvent.setup();
    const { rerender } = render(
      <Button data-example="forwarded" onClick={onClick} ref={ref}>
        Salvar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Salvar" });

    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("data-example", "forwarded");
    expect(ref.current).toBe(button);
    await user.click(button);
    await user.keyboard("{Enter} ");
    expect(onClick).toHaveBeenCalledTimes(3);

    rerender(<Button type="submit">Salvar</Button>);
    expect(button).toHaveAttribute("type", "submit");
  });

  it("disabled nativo bloqueia clique e sai da navegação por Tab", async () => {
    const onClick = vi.fn();
    const onKeyDown = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick} onKeyDown={onKeyDown}>
        Salvar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Salvar" });

    expect(button).toBeDisabled();
    await user.click(button);
    await user.tab();
    expect(button).not.toHaveFocus();
    await user.keyboard("{Enter} ");
    expect(onClick).not.toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("disabled com foco bloqueia clique, Enter e Space", async () => {
    const onClick = vi.fn();
    const onKeyDown = vi.fn();
    const user = userEvent.setup();
    render(
      <Button
        disabled
        focusableWhenDisabled
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        Salvar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Salvar" });

    await user.tab();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    await user.keyboard("{Enter} ");
    expect(onClick).not.toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("loading preserva foco, anuncia rótulo e bloqueia reativação", async () => {
    const onClick = vi.fn();
    const onKeyDown = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Button onClick={onClick}>Salvar</Button>);
    const button = screen.getByRole("button", { name: "Salvar" });
    await user.tab();
    expect(button).toHaveFocus();

    rerender(
      <Button
        focusableWhenDisabled={false}
        loading
        loadingLabel="Salvando…"
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        Salvar
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Salvando…" })).toBe(button);
    expect(button).toHaveFocus();
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("data-loading");
    expect(button.querySelector("[aria-hidden='true'] svg")).toHaveClass(
      "lucide-loader-circle",
    );
    await user.click(button);
    await user.keyboard("{Enter} ");
    expect(onClick).not.toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled();

    rerender(<Button onClick={onClick}>Salvar</Button>);
    expect(button).toHaveFocus();
    expect(button).toHaveAccessibleName("Salvar");
    expect(button).not.toHaveAttribute("data-loading");
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("className combina sobrescritas e recebe o estado atualizado da Base UI", () => {
    const className = vi.fn((state: { disabled: boolean }) =>
      state.disabled ? "h-12 px-8" : "h-10 px-4",
    );
    const { rerender } = render(
      <Button className={className} disabled>
        Salvar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Salvar" });

    expect(className).toHaveBeenCalledWith(
      expect.objectContaining({ disabled: true }),
    );
    expect(button).toHaveClass("h-12", "px-8");
    expect(button).not.toHaveClass(
      "h-(--spacing-control-default)",
      "px-(--spacing-padding-button-inline)",
    );
    rerender(<Button className={className}>Salvar</Button>);
    expect(className).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: false }),
    );
    expect(button).toHaveClass("h-10", "px-4");
    rerender(<Button className="h-16 px-10">Salvar</Button>);
    expect(button).toHaveClass("h-16", "px-10");
    expect(button).not.toHaveClass(
      "h-(--spacing-control-default)",
      "px-(--spacing-padding-button-inline)",
    );
  });

  it("preserva nomes acessíveis explícitos do consumidor durante loading", () => {
    const { rerender } = render(
      <>
        <span id="external-label">Publicar página</span>
        <Button aria-labelledby="external-label" loading>
          Salvar
        </Button>
      </>,
    );
    const button = screen.getByRole("button", { name: "Publicar página" });
    expect(button).toHaveAttribute("aria-labelledby", "external-label");

    rerender(
      <Button aria-label="Publicar página" loading>
        Salvar
      </Button>,
    );
    const namedButton = screen.getByRole("button", { name: "Publicar página" });
    expect(namedButton).toHaveAccessibleName("Publicar página");
    expect(namedButton).not.toHaveAttribute("aria-labelledby");
  });

  it("compõe ícone decorativo Lucide e rótulo do consumidor", () => {
    render(
      <Button>
        <Plus aria-hidden="true" />
        Novo projeto
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Novo projeto" });

    expect(button.querySelector("svg")).toHaveClass("lucide-plus");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(button).toHaveTextContent("Novo projeto");
  });

  it("render elemento mantém filhos e atributos e substitui conteúdo em loading", () => {
    const { rerender } = render(
      <Button
        render={
          <button className="custom-button" data-custom="preserved">
            Salvar
          </button>
        }
      >
        Outro rótulo
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Salvar" });
    expect(button).toHaveClass("custom-button");
    expect(button).toHaveAttribute("data-custom", "preserved");
    expect(button).not.toHaveTextContent("Outro rótulo");

    rerender(
      <Button
        loading
        loadingLabel="Salvando…"
        render={<button data-custom="preserved">Salvar</button>}
      />,
    );
    expect(button).toHaveAccessibleName("Salvando…");
    expect(button).toHaveTextContent("Salvando…");
    expect(button).not.toHaveTextContent(/^Salvar$/);
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("data-custom", "preserved");
    expect(button.querySelector("[aria-hidden='true'] svg")).toHaveClass(
      "lucide-loader-circle",
    );
  });

  it.each([false, true])(
    "render elemento preserva precedência de aria-label com loading=%s",
    (loading) => {
      render(
        <Button
          aria-label="Nome do Button"
          loading={loading}
          loadingLabel="Carregando"
          render={<button aria-label="Publicar página">Publicar</button>}
        />,
      );
      const button = screen.getByRole("button", { name: "Publicar página" });

      expect(button).toHaveAttribute("aria-label", "Publicar página");
      expect(button).not.toHaveAttribute("aria-labelledby");
      expect(button).toHaveTextContent(loading ? "Carregando" : "Publicar");
    },
  );

  it.each([false, true])(
    "render elemento preserva precedência de aria-labelledby com loading=%s",
    (loading) => {
      render(
        <>
          <span id="external-render-label">Publicar página</span>
          <span id="other-label">Outro nome</span>
          <Button
            aria-labelledby="other-label"
            loading={loading}
            loadingLabel="Carregando"
            render={
              <button aria-labelledby="external-render-label">Publicar</button>
            }
          />
        </>,
      );
      const button = screen.getByRole("button", { name: "Publicar página" });

      expect(button).toHaveAttribute(
        "aria-labelledby",
        "external-render-label",
      );
      expect(button).toHaveTextContent(loading ? "Carregando" : "Publicar");
    },
  );
});
