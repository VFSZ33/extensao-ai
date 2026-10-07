import { Button as BaseButton } from "@base-ui/react/button";
import {
  cloneElement,
  type ComponentProps,
  isValidElement,
  type ReactNode,
  useId,
} from "react";
import { twMerge } from "tailwind-merge";

import { ButtonSpinner } from "@/components/button/button-spinner";

export type ButtonProps = {
  loading?: boolean;
  loadingLabel?: ReactNode;
  size?: "default" | "large" | "touch";
  variant?: "destructive" | "primary" | "secondary" | "subtle";
} & ComponentProps<typeof BaseButton>;

export function Button({
  "aria-busy": ariaBusy,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  children,
  className,
  disabled = false,
  focusableWhenDisabled = false,
  loading = false,
  loadingLabel = "Carregando…",
  ref,
  render,
  size = "default",
  variant = "primary",
  ...props
}: ButtonProps) {
  const labelId = useId();
  const renderElement = isValidElement<
    Pick<ButtonProps, "aria-label" | "aria-labelledby" | "children">
  >(render)
    ? render
    : undefined;
  const accessibleLabel =
    renderElement && Object.hasOwn(renderElement.props, "aria-label")
      ? renderElement.props["aria-label"]
      : ariaLabel;
  const accessibleLabelledBy =
    renderElement && Object.hasOwn(renderElement.props, "aria-labelledby")
      ? renderElement.props["aria-labelledby"]
      : ariaLabelledBy;
  const content = (
    <>
      {loading && <ButtonSpinner />}
      <span
        className="inline-flex items-center gap-2 [&>svg]:size-(--spacing-icon-sm) [&>svg]:shrink-0"
        id={labelId}
      >
        {loading
          ? loadingLabel
          : renderElement?.props.children !== undefined
            ? renderElement.props.children
            : children}
      </span>
    </>
  );

  return (
    <BaseButton
      {...props}
      aria-busy={loading || ariaBusy}
      aria-label={ariaLabel}
      aria-labelledby={
        accessibleLabelledBy ?? (accessibleLabel ? undefined : labelId)
      }
      className={(state) =>
        twMerge(
          "control-label inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-(--radius-input) border whitespace-nowrap transition-colors duration-(--transition-duration-control) ease-(--ease-standard) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary data-[disabled]:not-data-[loading]:cursor-not-allowed data-[disabled]:not-data-[loading]:border-dashed data-[disabled]:not-data-[loading]:border-border-emphasis data-[disabled]:not-data-[loading]:bg-surface-elevated data-[disabled]:not-data-[loading]:text-text-muted data-[loading]:cursor-progress motion-reduce:transition-none [&>svg]:size-(--spacing-icon-sm) [&>svg]:shrink-0",
          size === "default" &&
            "h-(--spacing-control-default) px-(--spacing-padding-button-inline)",
          size === "large" &&
            "h-(--spacing-control-large) px-(--spacing-padding-button-inline)",
          size === "touch" && "h-(--spacing-touch-target) px-4",
          variant === "destructive" &&
            "border-border-emphasis bg-surface-elevated text-feedback-error not-data-[disabled]:hover:border-feedback-error not-data-[disabled]:hover:bg-surface-hover not-data-[disabled]:active:border-feedback-error not-data-[disabled]:active:bg-feedback-error not-data-[disabled]:active:text-action-on-primary",
          variant === "primary" &&
            "border-action-primary bg-action-primary text-action-on-primary not-data-[disabled]:hover:border-action-primary-hover not-data-[disabled]:hover:bg-action-primary-hover not-data-[disabled]:active:border-action-primary-active not-data-[disabled]:active:bg-action-primary-active",
          variant === "secondary" &&
            "border-border-emphasis bg-surface-elevated text-text-primary not-data-[disabled]:hover:border-border-control not-data-[disabled]:hover:bg-surface-hover not-data-[disabled]:active:border-action-primary not-data-[disabled]:active:bg-surface-hover",
          variant === "subtle" &&
            "border-transparent bg-transparent text-text-secondary not-data-[disabled]:hover:bg-surface-hover not-data-[disabled]:hover:text-text-primary not-data-[disabled]:active:border-border-emphasis not-data-[disabled]:active:bg-surface-hover not-data-[disabled]:active:text-text-primary",
          typeof className === "function" ? className(state) : className,
        )
      }
      data-loading={loading ? "" : undefined}
      disabled={disabled || loading}
      focusableWhenDisabled={focusableWhenDisabled || loading}
      ref={ref}
      render={
        renderElement ? cloneElement(renderElement, undefined, content) : render
      }
    >
      {content}
    </BaseButton>
  );
}
