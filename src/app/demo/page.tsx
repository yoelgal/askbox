"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, CheckIcon, SegmentedControl, TextField, cn } from "@fanvue/ui";
import { ApiError, api, money, useAction } from "@/lib/client";

// A password-protected walkthrough of the real app: the creator dashboard and
// the fan's view side by side, in a sandbox of their own. Payments and DMs are
// simulated; screening and drafting are the real AI.
const KEY = "askbox-demo";
// Other fans arrive on their own, like they would on a real profile.
const FIRST_FAN_AFTER = 8_000;
const FAN_EVERY = 40_000;
const MAX_AUTO_FANS = 10;

// The saved demo token lives in localStorage; this store lets React read it without a hydration mismatch.
const tokenStore = {
  subscribe: (cb: () => void) => (window.addEventListener("askbox-demo-token", cb), () => window.removeEventListener("askbox-demo-token", cb)),
  get: () => localStorage.getItem(KEY),
  set: (t: string | null) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY), window.dispatchEvent(new Event("askbox-demo-token"))),
};

export default function DemoPage() {
  const token = useSyncExternalStore(tokenStore.subscribe, tokenStore.get, () => undefined);
  useEffect(() => document.documentElement.classList.add("dark"), []);
  if (token === undefined) return <div className="min-h-dvh bg-background-primary" />;
  if (!token) return <Unlock onToken={tokenStore.set} />;
  return <Shell token={token} onSignOut={() => tokenStore.set(null)} />;
}

function Unlock({ onToken }: { onToken: (t: string) => void }) {
  const [password, setPassword] = useState("");
  const { run, pending, error } = useAction();
  return (
    <main className="grid min-h-dvh place-items-center bg-background-primary p-6 text-content-primary">
      <form
        className="flex w-full max-w-sm flex-col gap-5 rounded-3xl bg-surface-primary p-6"
        onSubmit={(e) => {
          e.preventDefault();
          run("busy", async () => onToken((await api<{ token: string }>("/api/demo/login", { method: "POST", body: { password } })).token));
        }}
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/askbox-icon.png" alt="" width={40} height={40} className="rounded-[10px]" />
          <div>
            <h1 className="typography-header-heading-xs">Askbox demo</h1>
            <p className="typography-body-small-14px-regular text-content-secondary">Paid Q&amp;A for Fanvue creators</p>
          </div>
        </div>
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={!!error}
          errorMessage={error ?? undefined}
          fullWidth
          autoFocus
        />
        <Button type="submit" variant="primary" size="48" loading={!!pending} disabled={!password}>
          Open the demo
        </Button>
      </form>
    </main>
  );
}

const STEPS = [
  {
    id: "ask",
    pane: "fan",
    text: "Start on the right: ask Sam a question as a fan, and pay for it.",
    phone: "Start in the Fan tab: ask Sam a question, and pay for it.",
    hint: "Try “my knee hurts when I squat, what’s wrong?” first to see a question stopped before anyone pays.",
  },
  {
    id: "answer",
    pane: "creator",
    text: "Now you’re Sam, on the left: open the question marked New and answer it.",
    phone: "Now you’re Sam: open the question marked New and answer it.",
    hint: "Use “Draft with AI” for a reply in Sam’s voice, or record a voice note.",
  },
  {
    id: "tip",
    pane: "fan",
    text: "Back on the right as the fan: open My questions and tip Sam’s answer.",
    phone: "Back in the Fan tab: open My questions and tip Sam’s answer.",
    hint: "Tips go to the creator, through Fanvue.",
  },
] as const;
type Step = (typeof STEPS)[number]["id"];

/** Which step a change in one of the views completes. */
function stepFor(path: string, action: string | null): Step | null {
  if (path.endsWith("/confirm") && action === "question") return "ask";
  if (path.startsWith("/api/creator/questions/") && action === "answer") return "answer";
  if (path.endsWith("/confirm") && action === "tip") return "tip";
  return null;
}

function Shell({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const creatorRef = useRef<HTMLIFrameElement>(null);
  const fanRef = useRef<HTMLIFrameElement>(null);
  const [done, setDone] = useState<Set<Step>>(new Set());
  const [tab, setTab] = useState<"fan" | "creator" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const autoCount = useRef(0);
  const q = `?demo=${encodeURIComponent(token)}&theme=dark`;

  const step = STEPS.find((s) => !done.has(s.id));
  // On a phone only one view fits: follow the step unless the viewer picked a tab.
  const view = tab ?? step?.pane ?? "creator";

  const refresh = (frame: HTMLIFrameElement | null) => frame?.contentWindow?.postMessage({ type: "askbox:demo-refresh" }, window.location.origin);

  // A change in one view refreshes the other and moves the instructions on.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "askbox:demo-changed") return;
      refresh(e.source === creatorRef.current?.contentWindow ? fanRef.current : creatorRef.current);
      const s = stepFor(String(e.data.path ?? ""), e.data.action ?? null);
      if (s) {
        setDone((d) => new Set(d).add(s));
        setTab(null);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Other (simulated) fans ask Sam questions now and then, like on a real profile.
  // Paid ones land in the inbox marked New; stopped ones never reach it.
  const bringFan = useCallback(async () => {
    try {
      const data = await api<{ status: string; name: string; amount?: number }>("/api/demo/simulate", { method: "POST", body: { demo: token } });
      if (data.status === "paid") {
        refresh(creatorRef.current);
        setNotice(`New question from ${data.name} · ${money(data.amount ?? 0)}`);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onSignOut();
      autoCount.current = MAX_AUTO_FANS; // the sandbox is full or the AI is down: stop asking
    }
  }, [token, onSignOut]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!document.hidden && autoCount.current < MAX_AUTO_FANS) {
        autoCount.current += 1;
        await bringFan();
      }
      if (autoCount.current < MAX_AUTO_FANS) timer = setTimeout(tick, FAN_EVERY);
    };
    timer = setTimeout(tick, FIRST_FAN_AFTER);
    return () => clearTimeout(timer);
  }, [bringFan]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  const glow = (pane: "fan" | "creator") => step?.pane === pane && "ring-2 ring-brand-primary-default shadow-[0_0_32px_rgba(73,242,100,0.18)]";

  return (
    <div className="flex min-h-dvh flex-col bg-background-primary text-content-primary lg:h-dvh">
      <header className="flex flex-col gap-3 border-b border-neutral-alphas-200 px-5 py-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/askbox-icon.png" alt="" width={32} height={32} className="rounded-[8px]" />
          <div className="min-w-0">
            <h1 className="typography-body-default-16px-semibold">Askbox demo</h1>
            <p className="typography-description-12px-regular text-content-secondary max-sm:hidden">
              You play both sides: Sam, a strength coach and creator, on the left, and one of Sam’s fans on the right. Payments and messages are simulated; the AI is real.
            </p>
            <p className="typography-description-12px-regular text-content-secondary sm:hidden">You play Sam, a coach, and one of Sam’s fans. Payments are simulated.</p>
          </div>
          <Button variant="tertiary" size="32" className="ml-auto shrink-0" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-brand-primary-default bg-surface-primary px-4 py-3" aria-live="polite">
          <span className="typography-description-12px-semibold shrink-0 rounded-full bg-brand-primary-default px-2.5 py-1 text-content-always-black">
            {step ? `Step ${STEPS.indexOf(step) + 1} of 3` : <CheckIcon className="size-3.5" aria-label="Done" />}
          </span>
          <div className="min-w-0">
            <p className="typography-body-default-16px-semibold text-pretty">
              {step ? (
                <>
                  <span className="max-lg:hidden">{step.text}</span>
                  <span className="lg:hidden">{step.phone}</span>
                </>
              ) : (
                "That’s the whole loop. Explore freely."
              )}
            </p>
            <p className="typography-body-small-14px-regular text-pretty text-content-secondary">
              {step ? step.hint : "Try the Brand tab, ask something that crosses Sam’s boundaries, or answer with a voice note. Other fans will keep dropping questions into the inbox."}
            </p>
          </div>
        </div>
      </header>

      <div className="px-5 pt-3 lg:hidden">
        <SegmentedControl
          size="40"
          aria-label="View"
          value={view}
          onChange={(v) => setTab(v as "fan" | "creator")}
          options={[
            { label: "Fan", value: "fan" },
            { label: "Sam (creator)", value: "creator" },
          ]}
        />
      </div>

      <div className="flex min-h-0 flex-1 gap-5 p-4 lg:p-5">
        <Pane
          title="Sam’s dashboard"
          hint={notice ?? "You, as the creator"}
          highlight={!!notice}
          className={cn("flex-[1.5]", glow("creator"), view !== "creator" && "max-lg:hidden")}
        >
          <iframe ref={creatorRef} src={`/creator${q}`} title="Sam’s dashboard" className="size-full" allow="microphone" />
        </Pane>
        <Pane
          title="Sam’s Askbox"
          hint="You, as a fan on Sam’s profile"
          className={cn("w-full lg:w-[420px] lg:shrink-0", glow("fan"), view !== "fan" && "max-lg:hidden")}
        >
          <iframe ref={fanRef} src={`/experience${q}`} title="Sam’s Askbox, as a fan" className="size-full" />
        </Pane>
      </div>
    </div>
  );
}

function Pane({ title, hint, highlight, className, children }: { title: string; hint: string; highlight?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("flex min-h-[75dvh] flex-col overflow-hidden rounded-2xl border border-neutral-alphas-200 bg-background-primary transition-shadow lg:min-h-0", className)}>
      <div className="flex items-baseline justify-between gap-3 border-b border-neutral-alphas-200 px-4 py-2.5">
        <h2 className="typography-body-small-14px-semibold shrink-0 whitespace-nowrap">{title}</h2>
        <p className={cn("typography-description-12px-regular truncate", highlight ? "font-semibold text-success-content" : "text-content-secondary")}>{hint}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}
