"use client";

import { Alert, EmptyState, Loader, LockerIcon } from "@fanvue/ui";
import { FanBox } from "@/components/FanBox";
import { useFanvueTheme, useSession } from "@/lib/client";

type Session = { entitled: boolean; token?: string; accessMode?: string };

export default function ExperiencePage() {
  useFanvueTheme();
  const s = useSession<Session>("/api/experience/session", "experienceToken");

  if (s.status === "loading") return <Loader show center minHeight="100dvh" ariaLabel="Opening Askbox" />;
  if (s.status === "error") {
    return (
      <main className="mx-auto max-w-md p-6">
        <Alert variant="error" title="Couldn't open Askbox">
          {s.error.message}
        </Alert>
      </main>
    );
  }
  if (!s.data.entitled) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <EmptyState
          variant="centered"
          titleSize="sm"
          media={<LockerIcon className="size-10 text-content-tertiary" />}
          title={s.data.accessMode === "SUBSCRIPTION" ? "Subscribers only" : "Locked"}
          description={
            s.data.accessMode === "SUBSCRIPTION"
              ? "Subscribe to this creator to ask them questions."
              : "You don't have access to this Askbox."
          }
        />
      </main>
    );
  }
  return (
    <main>
      <FanBox demo={s.demo} />
    </main>
  );
}
