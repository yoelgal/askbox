"use client";

import { useState } from "react";
import {
  Alert,
  Avatar,
  Button,
  ClockIcon,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FlashIcon,
  GiftIcon,
  LockerIcon,
  MessageIcon,
  Pill,
  Skeleton,
  SwitchField,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  TickCircleIcon,
  VerifiedIcon,
  cn,
} from "@fanvue/ui";
import type { Question, Tier } from "@/lib/db";
import { ago, api, askHost, firstName, inFanvue, initials, money, promise, useAction, useApi, useNow } from "@/lib/client";
import { Section, Thread } from "@/components/qa";
import { coverStyle, themeVars, type Theme } from "@/lib/theme";

type Action = Tier | "tip";
type Price = { externalActionId: Action; amount: number };
type WallItem = { id: string; body: string; answer: string | null; answeredAt: number; audioMs: number | null };
type CreatorInfo = { displayName: string; handle: string; avatarUrl: string | null; replyHours: Record<Tier, number>; theme: Theme };
type Data = { creator: CreatorInfo; prices: Price[]; mine: Question[]; wall: WallItem[]; preview: boolean };

const TIERS: Record<Tier, { label: string; icon: React.ReactNode }> = {
  question: { label: "Question", icon: <MessageIcon className="size-4" /> },
  priority: { label: "Priority", icon: <FlashIcon className="size-4" /> },
};
const ACTION_LABEL: Record<Action, string> = { question: "Question", priority: "Priority question", tip: "Tip" };

/**
 * Pays for a priced action through Fanvue's own sheet, then has the server
 * verify it. Outside Fanvue (demo) a stand-in sheet does the asking.
 */
type Pay = (action: Action, questionId: string, amount: number) => Promise<"paid" | "cancelled">;

/** `themeOverride` lets the creator's theme editor preview unsaved changes live. */
export function FanBox({ demo, themeOverride }: { demo: boolean; themeOverride?: Theme }) {
  const { data, error: loadError, reload: load } = useApi<Data>("/api/experience");
  const [sheet, setSheet] = useState<{ action: Action; amount: number; resolve: (ok: boolean) => void } | null>(null);
  const [tab, setTab] = useState<string | null>(null);

  const pay: Pay = async (action, questionId, amount) => {
    let reference: string;
    if (demo || !inFanvue()) {
      const ok = await new Promise<boolean>((resolve) => setSheet({ action, amount, resolve }));
      setSheet(null);
      if (!ok) return "cancelled";
      reference = `demo_${action}_${questionId}`;
    } else {
      const result = await askHost<{ type: string; status: string; purchaseReference?: string; clientReferenceId?: string }>(
        { type: "fanvue:experience:purchase-request", externalActionId: action, clientReferenceId: questionId },
        "fanvue:experience:purchase-result",
        (d) => d.clientReferenceId === questionId,
      );
      if (result.status === "cancelled") return "cancelled";
      if (result.status !== "succeeded" || !result.purchaseReference) throw new Error("The payment didn't go through. You haven't been charged.");
      reference = result.purchaseReference;
    }
    await api(`/api/experience/questions/${questionId}/confirm`, {
      method: "POST",
      body: { purchaseReference: reference, kind: action === "tip" ? "tip" : "question" },
    });
    return "paid";
  };

  if (loadError && !data) return <Alert variant="error" title="Couldn't load this Askbox" className="m-4">{loadError}</Alert>;
  if (!data) return <FanSkeleton />;

  const { creator } = data;
  const first = firstName(creator.displayName);
  const tipPrice = priceOf(data, "tip");
  const activeTab = tab ?? (data.mine.length ? "mine" : "wall");
  const theme = themeOverride ?? creator.theme;
  const cover = coverStyle(theme);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-6" style={themeVars(theme)}>
      <header className="-mx-4 flex flex-col items-center gap-4 px-6 pt-8 pb-2 text-center">
        <div className={cn("flex w-full justify-center rounded-lg", theme.cover === "gradient" ? "pt-12" : "pt-2")} style={cover}>
          <Avatar
            size={88}
            src={creator.avatarUrl ?? undefined}
            alt=""
            fallback={initials(creator.displayName)}
            className={cn(theme.cover === "gradient" && "-mb-11 ring-4 ring-[var(--color-background-primary)]")}
          />
        </div>
        <div className={cn("flex flex-col gap-1", theme.cover === "gradient" && "pt-10")}>
          <h1 className="typography-header-heading-sm text-balance">{theme.headline || `Ask ${first} anything`}</h1>
          <p className="typography-body-small-14px-regular text-pretty text-content-secondary">
            {theme.tagline || `@${creator.handle} · Replies within ${promise(creator.replyHours.priority)} for priority`}
          </p>
        </div>
      </header>

      {data.preview && (
        <Alert variant="info" title="You're previewing your own Askbox">
          This is what fans see. Paying is switched off in preview.
        </Alert>
      )}

      <Composer
        data={data}
        pay={pay}
        onSent={() => {
          load();
          setTab("mine");
        }}
      />

      <Tabs value={activeTab} onValueChange={setTab} className="mt-2">
        <TabsList fullWidth>
          <TabsTrigger value="wall">Answers</TabsTrigger>
          <TabsTrigger value="mine">My questions{data.mine.length ? ` (${data.mine.length})` : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="wall" className="pt-4">
          {data.wall.length ? (
            <ul className="flex flex-col gap-3">
              {data.wall.map((w) => (
                <li key={w.id} className="rounded-lg bg-surface-primary p-4">
                  <Thread
                    question={w.body}
                    answer={w.answer}
                    id={w.id}
                    audioMs={w.audioMs}
                    creator={creator}
                    answeredLabel={ago(w.answeredAt)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState variant="centered" titleSize="sm" title="No public answers yet" description={`Answers ${first} shares publicly will show up here.`} />
          )}
        </TabsContent>
        <TabsContent value="mine" className="pt-4">
          {data.mine.length ? (
            <ul className="flex flex-col gap-3">
              {data.mine.map((q) => (
                <MyQuestion key={q.id} q={q} creator={creator} tipPrice={tipPrice} pay={pay} onTipped={load} preview={data.preview} />
              ))}
            </ul>
          ) : (
            <EmptyState variant="centered" titleSize="sm" title="Nothing asked yet" description="Your questions and their answers live here." />
          )}
        </TabsContent>
      </Tabs>

      <DemoPaymentSheet
        open={!!sheet}
        amount={sheet?.amount ?? 0}
        title={sheet ? `${ACTION_LABEL[sheet.action]} for ${first}` : ""}
        onResolve={(ok) => sheet?.resolve(ok)}
      />
    </div>
  );
}

const priceOf = (data: Data, action: Action) => data.prices.find((p) => p.externalActionId === action)?.amount;

type Stage = { kind: "compose" } | { kind: "checking" } | { kind: "paying" } | { kind: "rejected"; reason: string } | { kind: "sent"; tier: Tier };

function Composer({ data, pay, onSent }: { data: Data; pay: Pay; onSent: () => void }) {
  const { creator } = data;
  const first = firstName(creator.displayName);
  const [body, setBody] = useState("");
  const [tier, setTier] = useState<Tier>("question");
  const [isPublic, setIsPublic] = useState(true);
  const [stage, setStage] = useState<Stage>({ kind: "compose" });
  const [error, setError] = useState<string | null>(null);
  const price = (t: Tier) => priceOf(data, t);
  const available = (Object.keys(TIERS) as Tier[]).filter((t) => price(t) !== undefined);
  const busy = stage.kind === "checking" || stage.kind === "paying";

  async function submit() {
    setError(null);
    setStage({ kind: "checking" });
    try {
      const res = await api<{ id?: string; rejected?: boolean; reason?: string }>("/api/experience/questions", {
        method: "POST",
        body: { body, tier, isPublic },
      });
      if (res.rejected) return setStage({ kind: "rejected", reason: res.reason ?? "" });
      setStage({ kind: "paying" });
      if ((await pay(tier, res.id!, price(tier)!)) === "cancelled") return setStage({ kind: "compose" });
      setStage({ kind: "sent", tier });
      setBody("");
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStage({ kind: "compose" });
    }
  }

  if (!available.length) {
    return (
      <Section>
        <EmptyState
          variant="centered"
          titleSize="sm"
          media={<LockerIcon className="size-10 text-content-tertiary" />}
          title="Not taking questions right now"
          description={`${first} hasn't turned on paid questions yet. Check back soon.`}
        />
      </Section>
    );
  }

  if (stage.kind === "sent") {
    return (
      <Section>
        <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
          <TickCircleIcon className="size-10 text-brand-primary-default" />
          <h2 className="typography-header-heading-xs">Question sent</h2>
          <p className="typography-body-small-14px-regular max-w-sm text-pretty text-content-secondary">
            {first} replies within {promise(creator.replyHours[stage.tier])}. You&rsquo;ll find the answer under My questions, and in your DMs.
          </p>
          <Button variant="secondary" size="40" onClick={() => setStage({ kind: "compose" })}>
            Ask another
          </Button>
        </div>
      </Section>
    );
  }

  const chosen = price(tier);
  return (
    <Section>
      <div className="flex flex-col gap-4 p-1">
        <TextArea
          label="Your question"
          placeholder={`What do you want to ask ${first}?`}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (stage.kind === "rejected") setStage({ kind: "compose" });
          }}
          maxLength={1000}
          minRows={3}
          maxRows={8}
          helperText={`${body.length}/1000`}
          fullWidth
          disabled={busy}
        />

        {stage.kind === "rejected" && (
          <Alert variant="warning" title={`${first} can't answer this one`}>
            {`${stage.reason} Edit your question and try again. You haven’t been charged.`}
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How fast do you want an answer?">
          {available.map((t) => (
            <TierOption key={t} tier={t} price={price(t)!} hours={creator.replyHours[t]} selected={tier === t} onSelect={() => setTier(t)} disabled={busy} />
          ))}
        </div>

        <SwitchField
          label="Share the answer publicly"
          helperText="Your name is never shown, only the question and answer."
          checked={isPublic}
          onCheckedChange={setIsPublic}
          disabled={busy}
        />

        {error && <Alert variant="error">{error}</Alert>}

        <div className="flex flex-col gap-2">
          <Button
            variant="brand"
            size="48"
            fullWidth
            loading={busy}
            disabled={body.trim().length < 3 || data.preview}
            onClick={submit}
            className="text-[var(--askbox-on-accent)] hover:text-[var(--askbox-on-accent)] disabled:bg-buttons-brand-default disabled:text-[var(--askbox-on-accent)] disabled:opacity-40"
          >
            {stage.kind === "checking" ? "Checking your question…" : `Ask ${first} · ${chosen !== undefined ? money(chosen) : ""}`}
          </Button>
          <p className="typography-description-12px-regular flex items-center justify-center gap-1.5 text-content-tertiary">
            <VerifiedIcon className="size-3.5" aria-hidden />
            Checked against {first}&rsquo;s boundaries before you pay
          </p>
        </div>
      </div>
    </Section>
  );
}

function TierOption(props: { tier: Tier; price: number; hours: number; selected: boolean; onSelect: () => void; disabled: boolean }) {
  const { tier, selected } = props;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={props.disabled}
      onClick={props.onSelect}
      className={cn(
        "flex items-center gap-3 rounded-sm border p-3 text-start transition-[border-color,background-color] duration-150",
        "focus-visible:shadow-focus-ring focus-visible:outline-none disabled:opacity-50",
        selected ? "border-border-selected bg-brand-primary-muted" : "border-border-primary hover:bg-neutral-alphas-50",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full",
          tier === "priority" ? "bg-brand-primary-muted text-brand-primary-default" : "bg-neutral-alphas-100 text-content-secondary",
        )}
      >
        {TIERS[tier].icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="typography-body-default-16px-semibold">{TIERS[tier].label}</span>
        <span className="typography-description-12px-regular inline-flex items-center gap-1 text-content-secondary">
          <ClockIcon className="size-3" aria-hidden /> Within {promise(props.hours)}
        </span>
      </span>
      <span className="typography-body-default-16px-semibold tabular">{money(props.price)}</span>
    </button>
  );
}

function MyQuestion(props: { q: Question; creator: CreatorInfo; tipPrice?: number; pay: Pay; onTipped: () => Promise<unknown>; preview: boolean }) {
  const { q, creator } = props;
  const first = firstName(creator.displayName);
  const { run, pending, error } = useAction();
  const now = useNow();
  const answered = q.status === "answered";

  const tip = () =>
    run("busy", async () => {
      if ((await props.pay("tip", q.id, props.tipPrice!)) === "paid") await props.onTipped();
    });

  const status =
    answered ? null : q.status === "declined" ? (
      <Pill variant="grey">{first} passed</Pill>
    ) : q.status === "refunded" ? (
      <Pill variant="grey">Refunded</Pill>
    ) : (
      <span className="typography-description-12px-regular inline-flex items-center gap-1 text-content-secondary">
        <ClockIcon className="size-3.5" aria-hidden />
        {q.dueAt && q.dueAt > now ? `Answer due by ${new Date(q.dueAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}` : "Answer on its way"}
      </span>
    );

  return (
    <li className="flex flex-col gap-3 rounded-lg bg-surface-primary p-4">
      <Thread
        question={q.body}
        answer={q.answer}
        id={q.id}
        audioMs={q.audioMs}
        creator={creator}
        answeredLabel={q.answeredAt ? ago(q.answeredAt) : undefined}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-primary pt-3">
        <span className="typography-description-12px-regular text-content-tertiary">
          {q.tier === "priority" ? "Priority · " : ""}Asked {ago(q.createdAt)} · {q.isPublic ? "Public" : "Private"}
        </span>
        {status}
        {answered &&
          (q.tipCents > 0 ? (
            <Pill variant="green" leftIcon={<GiftIcon className="size-3" />}>
              You tipped {money(q.tipCents)}
            </Pill>
          ) : props.tipPrice !== undefined && !props.preview ? (
            <Button variant="secondary" size="32" leftIcon={<GiftIcon className="size-4" />} loading={!!pending} onClick={tip}>
              Tip {first} {money(props.tipPrice)}
            </Button>
          ) : null)}
      </div>
      {error && <Alert variant="error">{error}</Alert>}
    </li>
  );
}

/** Stand-in for Fanvue's native payment sheet when running outside Fanvue. */
function DemoPaymentSheet(props: { open: boolean; amount: number; title: string; onResolve: (ok: boolean) => void }) {
  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onResolve(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>Demo payment. Inside Fanvue, fans pay with Fanvue&rsquo;s own sheet here.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex items-baseline justify-between rounded-sm bg-surface-secondary p-4">
            <span className="typography-body-default-16px-regular text-content-secondary">Total</span>
            <span className="typography-header-heading-xs tabular">{money(props.amount)}</span>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" size="40" onClick={() => props.onResolve(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="40" onClick={() => props.onResolve(true)}>
            Pay {money(props.amount)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FanSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-8" aria-busy="true" aria-label="Loading">
      <Skeleton variant="circular" width={88} height={88} />
      <Skeleton width="50%" height={28} />
      <Skeleton variant="rounded" width="100%" height={320} />
    </div>
  );
}
