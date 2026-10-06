"use client";

import { useEffect, useState } from "react";
import { Alert, Button, CheckIcon, ImageIcon, PlusIcon, SegmentedControl, Skeleton, TextField, cn } from "@fanvue/ui";
import type { Creator } from "@/lib/db";
import { ApiError, api, firstName, previewAsFan, useAction } from "@/lib/client";
import { DEFAULT_THEME, PRESETS, onAccent, type Theme } from "@/lib/theme";
import { FanBox } from "@/components/FanBox";
import { Section } from "@/components/qa";

/**
 * The creator's brand for their fan-facing Askbox, with a live preview of
 * exactly what fans see. Nothing changes for fans until Save.
 */
export function ThemeEditor({ creator, onSaved }: { creator: Creator; onSaved: () => Promise<unknown> }) {
  const [theme, setTheme] = useState<Theme>(creator.theme);
  const { run, pending, error } = useAction<"save" | "match">();
  const dirty = JSON.stringify(theme) !== JSON.stringify(creator.theme);
  const set = (patch: Partial<Theme>) => setTheme((t) => ({ ...t, ...patch }));
  const first = firstName(creator.displayName);

  // Resolves after the dashboard reloads, so the saved theme is the new baseline.
  const save = () =>
    run("save", async () => {
      await api("/api/creator/theme", { method: "PUT", body: theme });
      await onSaved();
    });

  const matchPhoto = () =>
    run("match", () =>
      dominantColour(creator.avatarUrl!).then(
        (accent) => set({ accent }),
        () => {
          throw new Error("Couldn't read your profile photo's colours. Pick one instead.");
        },
      ),
    );

  return (
    <div className="flex flex-col gap-4">
      <Section title="Colour">
        <div className="flex flex-col gap-4 p-1">
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Accent colour">
            {PRESETS.map((p) => (
              <Swatch key={p.accent} colour={p.accent} label={p.name} selected={theme.accent === p.accent} onSelect={() => set({ accent: p.accent })} />
            ))}
            <CustomSwatch colour={theme.accent} custom={!PRESETS.some((p) => p.accent === theme.accent)} onChange={(accent) => set({ accent })} />
          </div>
          {creator.avatarUrl && (
            <div>
              <Button variant="secondary" size="32" leftIcon={<ImageIcon className="size-4" />} loading={pending === "match"} onClick={matchPhoto}>
                Match my profile photo
              </Button>
            </div>
          )}
        </div>
      </Section>

      <Section title="Header">
        <div className="flex flex-col gap-4 p-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="typography-body-default-16px-semibold">Cover</span>
            <SegmentedControl
              size="32"
              appearance="pill"
              aria-label="Cover style"
              value={theme.cover}
              onChange={(v) => set({ cover: v as Theme["cover"] })}
              options={[
                { label: "None", value: "none" },
                { label: "Glow", value: "glow" },
                { label: "Banner", value: "gradient" },
              ]}
            />
          </div>
          <TextField
            label="Headline"
            placeholder={`Ask ${first} anything`}
            value={theme.headline}
            onChange={(e) => set({ headline: e.target.value })}
            maxLength={60}
            fullWidth
          />
          <TextField
            label="Intro line"
            placeholder="e.g. Real answers, no filter. Priority gets you to the front."
            helperText="Shown under the headline. Leave empty to show your reply time."
            value={theme.tagline}
            onChange={(e) => set({ tagline: e.target.value })}
            maxLength={140}
            fullWidth
          />
        </div>
      </Section>

      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex gap-3">
        <Button variant="primary" size="40" loading={pending === "save"} disabled={!dirty} onClick={save}>
          Save theme
        </Button>
        <Button variant="tertiary" size="40" disabled={!!pending || JSON.stringify(theme) === JSON.stringify(DEFAULT_THEME)} onClick={() => setTheme(DEFAULT_THEME)}>
          Reset to default
        </Button>
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <h2 className="typography-body-small-14px-semibold px-1 text-content-secondary">Live preview · what fans see</h2>
        <FanPreview theme={theme} />
      </div>
    </div>
  );
}

function Swatch({ colour, label, selected, onSelect }: { colour: string; label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
      className={cn(
        "grid size-10 place-items-center rounded-full transition-[scale] duration-150 active:scale-[0.96]",
        "focus-visible:shadow-focus-ring focus-visible:outline-none",
        selected && "ring-2 ring-content-primary ring-offset-2 ring-offset-[var(--color-surface-primary)]",
      )}
      style={{ background: colour, color: onAccent(colour) }}
    >
      {selected && <CheckIcon className="size-4" />}
    </button>
  );
}

/** Native colour input, so any hex works; shown as a swatch like the presets. */
function CustomSwatch({ colour, custom, onChange }: { colour: string; custom: boolean; onChange: (hex: string) => void }) {
  return (
    <label
      className={cn(
        "relative grid size-10 cursor-pointer place-items-center rounded-full border border-dashed border-border-strong",
        "focus-within:shadow-focus-ring",
        custom && "border-solid ring-2 ring-content-primary ring-offset-2 ring-offset-[var(--color-surface-primary)]",
      )}
      style={custom ? { background: colour, color: onAccent(colour) } : undefined}
      title="Custom colour"
    >
      {custom ? <CheckIcon className="size-4" /> : <PlusIcon className="size-4 text-content-secondary" />}
      <input type="color" aria-label="Custom colour" value={colour} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
    </label>
  );
}

/** Mints a fan session from the creator's and renders exactly what fans see. */
export function FanPreview({ theme, height = 420 }: { theme?: Theme; height?: number }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let restore: (() => void) | null = null;
    previewAsFan()
      .then((r) => {
        restore = r;
        setReady(true);
      })
      .catch((e: ApiError) => setError(e.message));
    return () => restore?.();
  }, []);
  if (error) return <Alert variant="error">{error}</Alert>;
  if (!ready) return <Skeleton variant="rounded" width="100%" height={height} />;
  return (
    <div className="overflow-hidden rounded-lg border border-border-primary bg-background-primary">
      <FanBox demo={false} themeOverride={theme} />
    </div>
  );
}

/**
 * The most common saturated colour in an image, from a 48px downsample.
 * Needs the image host to allow CORS; callers treat failure as "pick one".
 */
async function dominantColour(src: string) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, size, size);
  const px = ctx.getImageData(0, 0, size, size).data;
  // Score each hue bucket by saturation squared, so a vivid accent (lipstick,
  // flowers, a neon sign) beats a large but muted background.
  const bins = new Map<number, { w: number; r: number; g: number; b: number }>();
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b] = [px[i]!, px[i + 1]!, px[i + 2]!];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max ? (max - min) / max : 0;
    if (max < 70 || sat < 0.35) continue; // skip dark and washed-out pixels
    const h = hueOf(r, g, b, max, min);
    // Portraits are mostly skin (warm, mid-saturation hues): never the brand.
    const skin = h >= 10 && h <= 45 && sat < 0.7;
    const w = sat ** 3 * (max / 255) ** 2 * (skin ? 0.05 : 1);
    const hue = Math.round(h / 20) % 18; // 18 hue buckets
    const bin = bins.get(hue) ?? { w: 0, r: 0, g: 0, b: 0 };
    bins.set(hue, { w: bin.w + w, r: bin.r + r * w, g: bin.g + g * w, b: bin.b + b * w });
  }
  const best = [...bins.values()].sort((a, b) => b.w - a.w)[0];
  if (!best) throw new Error("no saturated colour");
  const hex = (v: number) => Math.round(v / best.w).toString(16).padStart(2, "0");
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}

function hueOf(r: number, g: number, b: number, max: number, min: number) {
  const d = max - min;
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}
