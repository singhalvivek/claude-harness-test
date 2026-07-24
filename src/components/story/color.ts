// Tiny color helper shared by the story reader + the decorative story layers
// (ambient decor, motif ornaments, intro/outro). Kept dependency-free so every
// story surface tints its themed accents/grounds the same way.

/** Add alpha to a `#rgb`/`#rrggbb` color; pass through anything else unchanged. */
export function withAlpha(color: string, a: number): string {
  const six = /^#([0-9a-f]{6})$/i.exec(color);
  if (six) {
    const n = parseInt(six[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const three = /^#([0-9a-f]{3})$/i.exec(color);
  if (three) {
    const [r, g, b] = three[1].split("").map((c) => parseInt(c + c, 16));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return color;
}
