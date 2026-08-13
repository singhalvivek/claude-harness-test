import { ReactNode } from "react";

type Tone = "warning" | "error" | "info";

const toneClasses: Record<Tone, string> = {
  warning: "border-yellow-400 bg-yellow-100 text-yellow-900",
  error: "border-red-300 bg-red-50 text-red-800",
  info: "border-ink/20 bg-ink/5 text-ink",
};

/** A prominent inline banner (e.g. the dev-default password warning). */
export function Banner({
  tone = "info",
  children,
  testId,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      data-testid={testId}
      className={`rounded-md border px-4 py-3 text-sm font-sans leading-relaxed ${toneClasses[tone]} ${className}`}
    >
      {children}
    </div>
  );
}
