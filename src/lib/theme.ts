import { z } from "zod";

// A creator's brand for the fan-facing Askbox. Fanvue still decides light or
// dark; the theme only swaps the accent and the hero, so it reads well in both.
export const ThemeSchema = z.object({
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  cover: z.enum(["none", "glow", "gradient"]),
  headline: z.string().trim().max(60),
  tagline: z.string().trim().max(140),
});
export type Theme = z.infer<typeof ThemeSchema>;

export const DEFAULT_THEME: Theme = { accent: "#49f264", cover: "glow", headline: "", tagline: "" };

export const PRESETS = [
  { name: "Fanvue green", accent: "#49f264" },
  { name: "Hot pink", accent: "#ff4d8d" },
  { name: "Violet", accent: "#9772ff" },
  { name: "Sky", accent: "#38bdf8" },
  { name: "Sunset", accent: "#ff7a45" },
  { name: "Gold", accent: "#f5b82e" },
  { name: "Cherry", accent: "#e5484d" },
  { name: "Mint", accent: "#3dd9b0" },
] as const;

export function parseTheme(raw: string | null): Theme {
  if (!raw) return DEFAULT_THEME;
  const parsed = ThemeSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : DEFAULT_THEME;
}

// WCAG relative luminance, to pick the readable text colour on the accent.
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Black or white, whichever contrasts more with the accent (always ≥ 4.5:1 for one of them). */
export const onAccent = (hex: string) => {
  const l = luminance(hex);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000000" : "#ffffff";
};

/**
 * The @fanvue/ui tokens a brand touches, scoped to the Askbox wrapper so the
 * library's own components (switches, selected states, chat bubbles, the
 * brand button) follow the creator's colour with no per-component styling.
 */
export function themeVars(t: Theme): React.CSSProperties {
  const a = t.accent;
  return {
    "--color-brand-primary-default": a,
    "--color-brand-primary-hover": `color-mix(in oklch, ${a} 85%, black)`,
    "--color-brand-primary-muted": `color-mix(in srgb, ${a} 22%, transparent)`,
    "--color-buttons-brand-default": a,
    "--color-buttons-brand-hover": `color-mix(in oklch, ${a} 85%, black)`,
    "--color-border-selected": a,
    "--color-messages-background-sender": `color-mix(in oklch, ${a} 24%, var(--color-background-primary))`,
    "--color-messages-background-sender-stroke": `color-mix(in oklch, ${a} 45%, var(--color-background-primary))`,
    "--askbox-on-accent": onAccent(a),
  } as React.CSSProperties;
}

/** Background for the hero behind the creator's avatar. */
export function coverStyle(t: Theme): React.CSSProperties | undefined {
  if (t.cover === "gradient") {
    return { background: `linear-gradient(135deg, ${t.accent}, color-mix(in oklch, ${t.accent} 40%, #7c3aed))` };
  }
  if (t.cover === "glow") {
    return { background: `radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, ${t.accent} 38%, transparent), transparent 70%)` };
  }
  return undefined;
}
