import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  Bodoni_Moda,
  Caveat,
  Fraunces,
  Inter,
  Playfair_Display,
  Space_Grotesk,
} from "next/font/google";
import "./globals.css";

// Warm editorial serif for trip/stop titles, clean sans for UI chrome.
// The CSS variables match tailwind.config.ts (`--font-serif` / `--font-sans`).
const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// ─── Phase 2.5: the four per-theme FEELING faces ─────────────────────────────
//
// One display face per story theme, drawn from four different TYPE CLASSES so
// no two themes read as variants of each other, and none reads as the app's
// chrome (Fraunces + Inter). Each is loaded latin-only, `display: "swap"`, with
// exactly ONE weight, so the whole feature costs four small WOFF2 files.
// Consumed via `--font-feeling-<theme>` by `src/components/story/themes/*.ts`
// (`feeling.quoteStyle.fontFamily`); the registration here and the consumption
// there must stay in sync — see spec/ui.md.

/** cinematic — dramatic display serif, the film-title-card voice. */
const feelingCinematic = Playfair_Display({
  subsets: ["latin"],
  weight: "600",
  variable: "--font-feeling-cinematic",
  display: "swap",
});

/** editorial — high-contrast didone, printed magazine authority (never a script).
 *  No `axes` option on purpose: the default optical-size instance keeps the
 *  hairlines sturdy enough for the ~20px inline pull-quote. */
const feelingEditorial = Bodoni_Moda({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-feeling-editorial",
  display: "swap",
});

/** minimal — geometric techno grotesque, squared terminals, engineered. */
const feelingMinimal = Space_Grotesk({
  subsets: ["latin"],
  weight: "500",
  variable: "--font-feeling-minimal",
  display: "swap",
});

/** vintage — the set's one and only cursive; legible down to 20px. */
const feelingVintage = Caveat({
  subsets: ["latin"],
  weight: "600",
  variable: "--font-feeling-vintage",
  display: "swap",
});

const FONT_VARIABLES = [
  serif.variable,
  sans.variable,
  feelingCinematic.variable,
  feelingEditorial.variable,
  feelingMinimal.variable,
  feelingVintage.variable,
].join(" ");

export const metadata: Metadata = {
  title: "Wanderline",
  description: "A visual trip journal — your stops along a winding path.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={FONT_VARIABLES}>
      <body className="min-h-screen bg-paper text-ink font-sans antialiased">{children}</body>
    </html>
  );
}
