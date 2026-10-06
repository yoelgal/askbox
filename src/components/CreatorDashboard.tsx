"use client";

import { useEffect, useState } from "react";
import {
  AiButton,
  Alert,
  AudioPlayer,
  AudioUpload,
  Avatar,
  Button,
  EmptyState,
  EyeIcon,
  GiftIcon,
  IconButton,
  InboxIcon,
  MicrophoneIcon,
  Pill,
  SegmentedControl,
  Skeleton,
  Snackbar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  TrashBinIcon,
  WarningTriangleIcon,
  cn,
} from "@fanvue/ui";
import type { Creator, Question, Tier } from "@/lib/db";
import { ago, api, askHost, blobToBase64, duration, inFanvue, initials, money, promise, useAction, useApi, useNow } from "@/lib/client";
import { FanPreview, ThemeEditor } from "@/components/ThemeEditor";
import { DueLabel, Section, Thread, TierPill } from "@/components/qa";

type Data = {
  creator: Creator;
  inbox: Question[];
  answered: Question[];
  stats: { earnedCents: number; tipsCents: number; answered: number; onTimeRate: number | null; avgResponseMs: number | null };
};

type Toast = { text: string; undo?: () => void } | null;

export function CreatorDashboard() {
  const { data, error, reload: load } = useApi<Data>("/api/creator");
  const [tab, setTab] = useState("inbox");
  const [toast, setToast] = useState<Toast>(null);
  const now = useNow();

  // Questions that arrive after the first load get a "New" badge.
  const [firstIds, setFirstIds] = useState<Set<string> | null>(null);
  if (data && !firstIds) setFirstIds(new Set(data.inbox.map((q) => q.id)));
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (error && !data) return <Alert variant="error" title="Couldn't load Askbox" className="m-6">{error}</Alert>;
  if (!data) return <DashboardSkeleton />;

  const { creator, stats } = data;
  const published = !!creator.experienceUuid;
  const overdue = data.inbox.filter((q) => q.dueAt && q.dueAt < now).length;
  const priority = data.inbox.filter((q) => q.tier === "priority").length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-3">
          <Avatar size={48} src={creator.avatarUrl ?? undefined} alt="" fallback={initials(creator.displayName)} />
          <div className="flex flex-col gap-0.5">
            <h1 className="typography-header-heading-sm">Askbox</h1>
            {published ? (
              <span className="typography-description-12px-semibold inline-flex items-center gap-1.5 text-content-secondary">
                <span className="size-1.5 rounded-full bg-brand-primary-default" aria-hidden />
                Live on your profile
              </span>
            ) : (
              <span className="typography-description-12px-regular text-content-secondary">Not published yet</span>
            )}
          </div>
        </div>
        {published && (
          <Button variant="secondary" size="40" leftIcon={<EyeIcon className="size-4" />} onClick={() => setTab("fan")}>
            Preview as a fan
          </Button>
        )}
      </header>

      {!published ? (
        <Setup creator={creator} onPublished={load} />
      ) : (
        <>
          <Section title="What's happening">
            <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Stat label="Earned" value={money(stats.earnedCents)} hint={stats.tipsCents ? `incl. ${money(stats.tipsCents)} in tips` : "All time"} />
              <Stat
                label="Waiting"
                value={String(data.inbox.length)}
                hint={overdue ? `${overdue} overdue` : priority ? `${priority} priority` : "All caught up"}
                tone={overdue ? "error" : undefined}
              />
              <Stat label="On time" value={stats.onTimeRate === null ? "–" : `${Math.round(stats.onTimeRate * 100)}%`} hint="Answered within promise" />
              <Stat label="Avg. reply" value={stats.avgResponseMs ? duration(stats.avgResponseMs) : "–"} hint={`${stats.answered} answered`} />
            </dl>
          </Section>

          <Tabs value={tab} onValueChange={setTab} className="mt-2 min-w-0">
            <TabsList fullWidth scrollable className="max-w-full">
              <TabsTrigger value="inbox">Inbox{data.inbox.length ? ` (${data.inbox.length})` : ""}</TabsTrigger>
              <TabsTrigger value="answered">Answered</TabsTrigger>
              <TabsTrigger value="brand">Brand</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="fan">Fan view</TabsTrigger>
            </TabsList>

            <TabsContent value="inbox" className="pt-4">
              {data.inbox.length ? (
                <ul className="flex flex-col gap-3">
                  {data.inbox.map((q, i) => (
                    <InboxItem
                      key={q.id}
                      q={q}
                      isNew={!!firstIds && !firstIds.has(q.id)}
                      defaultOpen={i === 0}
                      onDone={(text, undo) => {
                        setToast({ text, undo });
                        return load();
                      }}
                    />
                  ))}
                </ul>
              ) : (
                <Section>
                  <EmptyState
                    variant="centered"
                    titleSize="sm"
                    media={<InboxIcon className="size-10 text-content-tertiary" />}
                    title="Inbox zero"
                    description="New paid questions land here, soonest-due first."
                  />
                </Section>
              )}
            </TabsContent>

            <TabsContent value="answered" className="pt-4">
              {data.answered.length ? (
                <ul className="flex flex-col gap-3">
                  {data.answered.map((q) => (
                    <AnsweredItem key={q.id} q={q} creator={creator} />
                  ))}
                </ul>
              ) : (
                <Section>
                  <EmptyState variant="centered" titleSize="sm" title="Nothing answered yet" description="Your answers will be collected here." />
                </Section>
              )}
            </TabsContent>

            <TabsContent value="brand" className="pt-4">
              <ThemeEditor
                creator={creator}
                onSaved={() => {
                  setToast({ text: "Theme saved. Fans see it now" });
                  return load();
                }}
              />
            </TabsContent>

            <TabsContent value="settings" className="pt-4">
              <Settings
                creator={creator}
                onSaved={() => {
                  setToast({ text: "Settings saved" });
                  return load();
                }}
              />
              <DeleteData />
            </TabsContent>

            <TabsContent value="fan" className="pt-4">
              <FanPreview height={320} />
            </TabsContent>
          </Tabs>
        </>
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" role="status">
          <Snackbar
            className="pointer-events-auto"
            showActions={!!toast.undo}
            primaryLabel="Undo"
            primaryOnClick={() => {
              toast.undo?.();
              setToast(null);
            }}
            closable
            onClose={() => setToast(null)}
          >
            {toast.text}
          </Snackbar>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "error" }) {
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-border-primary p-4">
      <dt className="typography-body-small-14px-semibold text-content-secondary">{label}</dt>
      <dd className="typography-header-heading-md tabular">{value}</dd>
      <dd className={cn("typography-description-12px-regular", tone === "error" ? "text-error-content" : "text-content-tertiary")}>{hint}</dd>
    </div>
  );
}

type Voice = { blob: Blob; ms: number; url: string };

function InboxItem(props: { q: Question; isNew: boolean; defaultOpen: boolean; onDone: (text: string, undo?: () => void) => Promise<unknown> }) {
  const { q, isNew, defaultOpen, onDone } = props;
  const [open, setOpen] = useState(defaultOpen);
  const [mode, setMode] = useState<"write" | "voice">("write");
  const [text, setText] = useState(q.draft ?? "");
  const [aiDrafted, setAiDrafted] = useState(!!q.draft);
  const [voice, setVoice] = useState<Voice | null>(null);
  const { run, pending, error, setError } = useAction<"draft" | "answer" | "decline">();
  const act = (body: unknown) => api<{ draft?: string; dmSent?: boolean }>(`/api/creator/questions/${q.id}`, { method: "POST", body });

  useEffect(() => () => void (voice && URL.revokeObjectURL(voice.url)), [voice]);

  const draft = () =>
    run("draft", async () => {
      const res = await act({ action: "draft" });
      setText(res.draft ?? "");
      setAiDrafted(true);
    });

  // Each resolves only after the inbox reloads, so the buttons stay busy until this item is gone.
  const send = () =>
    run("answer", async () => {
      const audio = mode === "voice" && voice ? { data: await blobToBase64(voice.blob), mime: voice.blob.type || "audio/webm", ms: Math.round(voice.ms) } : null;
      const res = await act({ action: "answer", text: mode === "write" ? text : "", audio });
      await onDone(res.dmSent ? `Answer sent. ${q.fanName} got a DM` : `Answered ${q.fanName}`);
    });

  const decline = () =>
    run("decline", async () => {
      await act({ action: "decline" });
      await onDone(`Passed on ${q.fanName}'s question`, () => act({ action: "undo" }).then(() => onDone("Moved back to your inbox")));
    });

  function takeRecording(blob: Blob, ms: number) {
    setVoice({ blob, ms, url: URL.createObjectURL(blob) });
  }

  // Uploaded files don't come with a duration; read it from the audio itself.
  function takeFile(file: File) {
    const url = URL.createObjectURL(file);
    const probe = new Audio(url);
    probe.onloadedmetadata = () => setVoice({ blob: file, ms: (isFinite(probe.duration) ? probe.duration : 1) * 1000, url });
  }

  const canSend = mode === "write" ? !!text.trim() : !!voice;
  const drafting = pending === "draft";
  const busy = !!pending;

  return (
    <li className="rounded-lg bg-surface-primary">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-col gap-3 rounded-lg p-4 text-start focus-visible:shadow-focus-ring focus-visible:outline-none"
      >
        <span className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
          <Avatar size={32} fallback={initials(q.fanName)} alt="" />
          <span className="flex min-w-0 flex-col">
            <span className="typography-body-small-14px-semibold flex items-center gap-2">
              {q.fanName}
              {isNew && <span className="typography-description-12px-semibold rounded-full bg-brand-primary-default px-2 py-0.5 text-content-always-black">New</span>}
            </span>
            <span className="typography-description-12px-regular text-content-tertiary">
              {ago(q.paidAt ?? q.createdAt)}
              {q.topic ? ` · ${q.topic}` : ""}
            </span>
          </span>
          <span className="ms-auto flex items-center gap-3">
            <DueLabel dueAt={q.dueAt} className="hidden sm:inline-flex" />
            <TierPill tier={q.tier} amount={q.amountCents} />
          </span>
        </span>
        <span className={cn("typography-body-default-16px-regular text-pretty", !open && "line-clamp-2")}>{q.body}</span>
        <span className="flex items-center gap-3 sm:hidden">
          <DueLabel dueAt={q.dueAt} />
        </span>
        {q.flag && !open && (
          <span className="typography-description-12px-semibold inline-flex items-center gap-1 text-warning-content">
            <WarningTriangleIcon className="size-3.5" aria-hidden /> Worth a careful read
          </span>
        )}
      </button>

      {open && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {q.flag && (
            <Alert variant="warning" title="Worth a careful read">
              {q.flag}
            </Alert>
          )}

          <div className="flex flex-col gap-3 rounded-sm border border-border-primary p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SegmentedControl
                size="32"
                appearance="pill"
                aria-label="Answer format"
                value={mode}
                onChange={(v) => setMode(v as "write" | "voice")}
                options={[
                  { label: "Write", value: "write" },
                  { label: "Voice note", value: "voice" },
                ]}
              />
              <span className="typography-description-12px-regular text-content-tertiary">
                {q.isPublic ? "Fan chose to share this publicly" : "Private to this fan"}
              </span>
            </div>

            {mode === "write" ? (
              <>
                <div className={cn("rounded-sm transition-[box-shadow] duration-200", aiDrafted && text && "shadow-[0_0_0_1px_var(--color-brand-primary-default),0_0_18px_-4px_var(--color-brand-primary-default)]")}>
                  <TextArea
                    aria-label="Your answer"
                    placeholder="Write your answer, or let AI draft it in your voice"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    minRows={4}
                    maxRows={14}
                    maxLength={4000}
                    fullWidth
                    disabled={drafting}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <AiButton label={text ? "Redraft with AI" : "Draft with AI"} activeLabel="Drafting in your voice…" active={drafting} onClick={draft} disabled={busy} />
                  {aiDrafted && text && !drafting && (
                    <span className="typography-description-12px-regular text-content-tertiary">AI draft. Make it yours before sending.</span>
                  )}
                </div>
              </>
            ) : voice ? (
              <div className="flex items-center gap-2">
                <AudioPlayer src={voice.url} duration={voice.ms / 1000} className="flex-1" />
                <IconButton variant="tertiary" size="40" icon={<TrashBinIcon />} aria-label="Delete recording" onClick={() => setVoice(null)} disabled={busy} />
              </div>
            ) : (
              <AudioUpload
                allowRecording
                maxFiles={1}
                maxFileSize={3_000_000}
                maxRecordingDuration={120}
                minRecordingDuration={1}
                uploadTitle="Record a voice answer"
                uploadDescription="Or drop an audio file, up to 2 minutes"
                recordButtonLabel="Record"
                onRecordingComplete={takeRecording}
                onFilesAccepted={(files) => files[0] && takeFile(files[0])}
                onRecordingTooShort={() => setError("That was too short. Record at least a second.")}
                onPermissionError={() => setError("Microphone access is blocked here. Upload an audio file instead.")}
              />
            )}
          </div>

          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex items-center justify-end gap-3">
            <Button variant="tertiaryDestructive" size="40" onClick={decline} loading={pending === "decline"} disabled={busy}>
              Pass
            </Button>
            <Button
              variant="primary"
              size="40"
              leftIcon={mode === "voice" ? <MicrophoneIcon className="size-4" /> : undefined}
              onClick={send}
              loading={pending === "answer"}
              disabled={!canSend || busy}
            >
              {mode === "voice" ? "Send voice answer" : "Send answer"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function AnsweredItem({ q, creator }: { q: Question; creator: Creator }) {
  const onTime = q.dueAt && q.answeredAt ? q.answeredAt <= q.dueAt : null;
  return (
    <li className="flex flex-col gap-3 rounded-lg bg-surface-primary p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Avatar size={32} fallback={initials(q.fanName)} alt="" />
        <span className="flex flex-col">
          <span className="typography-body-small-14px-semibold">{q.fanName}</span>
          <span className="typography-description-12px-regular text-content-tertiary">
            {q.status === "declined" ? "Passed" : `Answered in ${duration((q.answeredAt ?? 0) - (q.paidAt ?? q.createdAt))}`}
            {onTime === false ? " · late" : ""} · {q.isPublic ? "Public" : "Private"}
          </span>
        </span>
        <span className="ms-auto flex items-center gap-2">
          {q.tipCents > 0 && (
            <Pill variant="green" leftIcon={<GiftIcon className="size-3" />}>
              Tipped {money(q.tipCents)}
            </Pill>
          )}
          <TierPill tier={q.tier} amount={q.amountCents} />
        </span>
      </div>
      {q.status === "declined" ? (
        <p className="typography-body-default-16px-regular text-pretty text-content-secondary">{q.body}</p>
      ) : (
        <Thread
          question={q.body}
          answer={q.answer}
          id={q.id}
          audioMs={q.audioMs}
          creator={creator}
          answeredLabel={q.answeredAt ? ago(q.answeredAt) : undefined}
        />
      )}
    </li>
  );
}

const QUESTION_HOURS = [24, 48, 72, 168];
const PRIORITY_HOURS = [6, 12, 24, 48];

/** Voice, boundaries and reply times. In `setup` it's the first onboarding step, so it can submit unchanged. */
function Settings({ creator, onSaved, setup = false }: { creator: Creator; onSaved: () => unknown; setup?: boolean }) {
  const [voice, setVoice] = useState(creator.voice);
  const [boundaries, setBoundaries] = useState(creator.boundaries);
  const [hours, setHours] = useState(creator.replyHours);
  const { run, pending, error } = useAction();
  const dirty =
    voice !== creator.voice || boundaries !== creator.boundaries || hours.question !== creator.replyHours.question || hours.priority !== creator.replyHours.priority;
  const hoursOptions = (list: number[]) => list.map((h) => ({ label: h < 24 ? `${h}h` : promise(h), value: String(h) }));
  const setTier = (t: Tier) => (v: string) => setHours((h) => ({ ...h, [t]: Number(v) }));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run("busy", async () => {
          await api("/api/creator", { method: "PATCH", body: { voice, boundaries, replyHours: hours } });
          await onSaved();
        });
      }}
    >
      <Section title="Your voice">
        <div className="flex flex-col gap-4 p-1">
          <TextArea
            label="How you talk"
            helperText="AI drafts copy this, along with your past answers."
            placeholder="e.g. Lowercase, lots of emoji, short and warm. Never formal."
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            minRows={3}
            maxLength={2000}
            fullWidth
          />
          <TextArea
            label="What you won't answer"
            helperText="Questions that cross these lines are stopped before the fan pays."
            placeholder="e.g. Nothing about my family or where I live. No meetups."
            value={boundaries}
            onChange={(e) => setBoundaries(e.target.value)}
            minRows={3}
            maxLength={2000}
            fullWidth
          />
        </div>
      </Section>

      <Section title="Reply times">
        <div className="flex flex-col gap-4 p-1">
          <p className="typography-body-small-14px-regular text-pretty text-content-secondary">
            Fans see these before they pay. Questions paid for keep the promise they were bought with.
          </p>
          <ReplyRow label="Question" value={String(hours.question)} options={hoursOptions(QUESTION_HOURS)} onChange={setTier("question")} />
          <ReplyRow label="Priority" value={String(hours.priority)} options={hoursOptions(PRIORITY_HOURS)} onChange={setTier("priority")} />
        </div>
      </Section>

      {error && <Alert variant="error">{error}</Alert>}
      <div>
        <Button type="submit" variant="primary" size="40" loading={!!pending} disabled={!dirty && !setup}>
          {setup ? "Continue" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

/** GDPR erasure, two steps because confirm() is blocked inside Fanvue's iframe. */
function DeleteData() {
  const [stage, setStage] = useState<"idle" | "confirm" | "done">("idle");
  const { run, pending, error } = useAction();
  return (
    <div className="mt-4">
      <Section title="Your data">
        <div className="flex flex-col gap-3 p-1">
          <p className="typography-body-small-14px-regular text-pretty text-content-secondary">
            {stage === "done"
              ? "Your Askbox data is deleted. Unpublish Askbox from your Fanvue profile and uninstall it to finish."
              : "Delete everything Askbox stores for you: questions, answers, voice notes, tips and settings. This can’t be undone, and unanswered paid questions are lost, so answer or pass them first."}
          </p>
          {error && <Alert variant="error">{error}</Alert>}
          {stage !== "done" && (
            <div className="flex flex-wrap gap-2">
              {stage === "idle" ? (
                <Button type="button" variant="tertiaryDestructive" size="40" onClick={() => setStage("confirm")}>
                  Delete my Askbox data
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    size="40"
                    loading={!!pending}
                    onClick={() =>
                      run("busy", async () => {
                        await api("/api/creator", { method: "DELETE" });
                        setStage("done");
                      })
                    }
                  >
                    Delete everything
                  </Button>
                  <Button type="button" variant="tertiary" size="40" onClick={() => setStage("idle")} disabled={!!pending}>
                    Cancel
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

function ReplyRow(props: { label: string; value: string; options: { label: string; value: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="typography-body-default-16px-semibold">{props.label}</span>
      <SegmentedControl size="32" appearance="pill" aria-label={`${props.label} reply time`} value={props.value} onChange={props.onChange} options={props.options} />
    </div>
  );
}

function Setup({ creator, onPublished }: { creator: Creator; onPublished: () => Promise<unknown> }) {
  const [step, setStep] = useState<1 | 2>(creator.boundaries || creator.voice ? 2 : 1);
  const { run, pending, error } = useAction();

  const publish = () =>
    run("busy", async () => {
      const res = await api<{ token?: string; demo?: boolean }>("/api/creator/publish", { method: "POST" });
      let experienceUuid: string | null = null;
      if (res.token && inFanvue()) {
        // Fanvue shows its own confirm modal, where the creator sets the real prices.
        const result = await askHost<{ type: string; status: string; experienceId?: string }>(
          { type: "fanvue:experience:publish-request", token: res.token },
          "fanvue:experience:publish-result",
        );
        if (result.status !== "published" || !result.experienceId) return;
        experienceUuid = result.experienceId;
      } else if (!res.demo) {
        throw new Error("Open Askbox from inside Fanvue to publish it.");
      }
      await api("/api/creator/publish", { method: "PUT", body: { experienceUuid } });
      await onPublished();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-1">
        <h2 className="typography-header-heading-sm text-balance">Get paid to answer your fans&rsquo; questions</h2>
        <p className="typography-body-default-16px-regular text-pretty text-content-secondary">
          Fans pay to ask you anything, priority jumps the queue, and happy fans can tip. AI checks every question against your boundaries
          before the fan pays and drafts replies in your voice. Nothing is sent until you hit send.
        </p>
      </div>
      <Section>
        <ol className="flex flex-col gap-1">
          <SetupStep n={1} title="Tell Askbox how you talk" active={step === 1} done={step > 1}>
            <Settings creator={creator} setup onSaved={() => setStep(2)} />
          </SetupStep>
          <SetupStep n={2} title="Add it to your profile" active={step === 2} done={false}>
            <div className="flex flex-col gap-3">
              <p className="typography-body-small-14px-regular text-pretty text-content-secondary">
                You&rsquo;ll confirm in Fanvue and set your own prices. We suggest {money(500)} a question, {money(1500)} for priority and {money(500)}{" "}
                tips.
              </p>
              {error && <Alert variant="error">{error}</Alert>}
              <div className="flex gap-3">
                <Button variant="primary" size="40" onClick={publish} loading={!!pending}>
                  Publish Askbox
                </Button>
                <Button variant="tertiary" size="40" onClick={() => setStep(1)} disabled={!!pending}>
                  Back
                </Button>
              </div>
            </div>
          </SetupStep>
        </ol>
      </Section>
    </div>
  );
}

function SetupStep({ n, title, active, done, children }: { n: number; title: string; active: boolean; done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-4 rounded-sm p-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "typography-body-small-14px-semibold grid size-7 place-items-center rounded-full tabular",
            done ? "bg-brand-primary-default text-content-always-black" : active ? "bg-content-primary text-content-primary-inverted" : "bg-neutral-alphas-100 text-content-secondary",
          )}
        >
          {done ? "✓" : n}
        </span>
        <h3 className={cn("typography-body-default-16px-semibold", !active && "text-content-secondary")}>{title}</h3>
      </div>
      {active && children}
    </li>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6" aria-busy="true" aria-label="Loading">
      <Skeleton variant="rounded" width={200} height={48} />
      <Skeleton variant="rounded" height={150} />
      <Skeleton variant="rounded" height={200} />
      <Skeleton variant="rounded" height={120} />
    </div>
  );
}
