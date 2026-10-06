import Link from "next/link";

const STEPS = [
  ["Fans ask, and pay", "A Question or a faster Priority reply, each with the reply time you promise, right on your Fanvue profile."],
  ["Checked before anyone pays", "AI checks every question against the boundaries you set. If it crosses a line, the fan is told why and isn’t charged."],
  ["You answer in your voice", "Type it, record a voice note, or start from an AI draft written in your style. Fans can tip answers they love."],
] as const;

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <h1 className="typography-header-heading-lg text-balance">Paid Q&amp;A for Fanvue creators</h1>
        <p className="typography-body-default-16px-regular text-pretty text-content-secondary">
          Fans already ask you questions all day, mostly for free. Askbox turns them into paid questions on your Fanvue profile,
          screened against your boundaries before anyone is charged.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="https://www.fanvue.com/apps"
            className="typography-body-default-16px-semibold rounded-full bg-content-primary px-5 py-3 text-background-primary hover:opacity-90"
          >
            Get Askbox on the Fanvue App Store
          </a>
          <Link href="/demo" className="typography-body-default-16px-semibold rounded-full bg-surface-primary px-5 py-3 hover:bg-neutral-alphas-100">
            Try the demo
          </Link>
        </div>
        <p className="typography-body-small-14px-regular text-content-secondary">
          Already installed? Open Askbox from your Fanvue account to set it up.
        </p>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/askbox-preview.webp"
        alt="Askbox on a phone: a question asking a coach to diagnose knee pain is stopped before payment, with the note that the fan hasn’t been charged."
        width={1920}
        height={1080}
        className="h-auto w-full rounded-2xl border border-neutral-alphas-200"
      />

      <ol className="flex flex-col gap-6">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="flex gap-4">
            <span className="typography-body-default-16px-semibold flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-primary tabular-nums">
              {i + 1}
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="typography-body-default-16px-semibold">{title}</h2>
              <p className="typography-body-default-16px-regular text-pretty text-content-secondary">{body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="typography-body-small-14px-regular text-pretty text-content-secondary">
        Payments run through Fanvue, and each creator sets their own prices. Askbox never sees card details.
      </p>
    </div>
  );
}
