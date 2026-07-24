"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-sans font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-trail/40";

const variantClasses: Record<ButtonVariant, string> = {
  // `bg-trail` gives the primary button a solid, non-transparent background —
  // relied on by the E2E "styled CSS" assertion.
  primary: "bg-trail text-paper hover:brightness-110 shadow-sm",
  secondary: "border border-ink/20 bg-paper text-ink hover:bg-ink/5",
  ghost: "text-ink/80 hover:bg-ink/5",
  danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
};

/** Reusable class string so a `next/link` <a> can look like a button. */
export function buttonClasses(variant: ButtonVariant = "primary", extra = ""): string {
  return `${base} ${variantClasses[variant]} ${extra}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  // Custom components do not inherit React's intrinsic data-* allowance, so we
  // declare the test hook explicitly.
  "data-testid"?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", className = "", type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={buttonClasses(variant, className)}
      {...rest}
    />
  );
});
