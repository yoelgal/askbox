"use client";

import { useEffect, useRef, useState } from "react";
import { ChatMessage, ClockIcon, FlashIcon, Pill, cn } from "@fanvue/ui";
import type { Tier } from "@/lib/db";
import { apiBlob, clock, duration, initials, money, useNow } from "@/lib/client";

/** Question and answer as a DM thread: the fan on the right, the creator on the left. */
export function Thread(props: {
  question: string;
  answer: string | null;
  /** The question's id, which is also its voice answer's, when audioMs is set. */
  id: string;
  audioMs: number | null;
  creator: { displayName: string; avatarUrl: string | null };
  answeredLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <ChatMessage user="sender" variant="text" message={props.question} />
      {props.audioMs && (
        <VoiceBubble id={props.id} ms={props.audioMs} creator={props.creator} time={props.answer ? undefined : props.answeredLabel} />
      )}
      {props.answer && (
        <ChatMessage
          user="receiver"
          variant="text"
          message={props.answer}
          time={props.answeredLabel}
          showAvatar
          avatarSrc={props.creator.avatarUrl ?? undefined}
          avatarFallback={initials(props.creator.displayName)}
          avatarAlt=""
        />
      )}
    </div>
  );
}

// A stable pseudo-waveform per answer; real peaks aren't worth decoding here.
function waveform(seed: string, n = 36) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: n }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    return 0.25 + ((h >>> 16) % 1000) / 1000 * 0.75 * Math.sin(((i + 1) / n) * Math.PI) ** 0.4;
  });
}

/** Fanvue's own voice-note bubble, driving a hidden <audio> fed from an authed fetch. */
function VoiceBubble({ id, ms, creator, time }: { id: string; ms: number; creator: { displayName: string; avatarUrl: string | null }; time?: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src]);

  async function toggle(next: boolean) {
    if (!next) return audio.current?.pause();
    let url = src;
    if (!url) {
      url = URL.createObjectURL(await apiBlob(`/api/audio/${id}`));
      setSrc(url);
      audio.current!.src = url;
    }
    await audio.current!.play();
  }

  return (
    <>
      <ChatMessage
        user="receiver"
        variant="audio"
        audioDuration={clock(ms)}
        waveform={waveform(id)}
        playing={playing}
        onPlayingChange={toggle}
        time={time}
        showAvatar
        avatarSrc={creator.avatarUrl ?? undefined}
        avatarFallback={initials(creator.displayName)}
        avatarAlt=""
        playLabel={`Play ${creator.displayName}'s voice answer`}
        pauseLabel="Pause"
      />
      <audio ref={audio} hidden onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
    </>
  );
}

export function TierPill({ tier, amount }: { tier: Tier; amount: number | null }) {
  const price = amount !== null ? ` · ${money(amount)}` : "";
  return tier === "priority" ? (
    <Pill variant="gold" leftIcon={<FlashIcon className="size-3" />}>
      Priority{price}
    </Pill>
  ) : (
    <Pill variant="grey">Question{price}</Pill>
  );
}

/** Time left on the reply promise. Colour follows urgency, and the words say it too. */
export function DueLabel({ dueAt, className }: { dueAt: number | null; className?: string }) {
  const now = useNow();
  if (!dueAt) return null;
  const left = dueAt - now;
  const tone = left < 0 ? "text-error-content" : left < 3 * 3_600_000 ? "text-warning-content" : "text-content-secondary";
  return (
    <span className={cn("typography-description-12px-semibold inline-flex items-center gap-1 tabular", tone, className)}>
      <ClockIcon className="size-3.5" aria-hidden />
      {left < 0 ? `Overdue by ${duration(-left)}` : `Reply within ${duration(left)}`}
    </span>
  );
}

/** A section surface, Fanvue style: rounded card, tiles nested inside with concentric radius. */
export function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface-primary p-3">
      {title && (
        <div className="flex min-h-8 items-center px-1 pt-1">
          <h2 className="typography-body-default-16px-semibold">{title}</h2>
        </div>
      )}
      {children}
    </section>
  );
}
