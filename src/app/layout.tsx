import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Inter } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Wanderline",
  description: "A visual trip journal — your stops along a winding path.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-paper text-ink font-sans antialiased">{children}</body>
    </html>
  );
}
