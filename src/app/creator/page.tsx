"use client";

import { Alert, Loader } from "@fanvue/ui";
import { CreatorDashboard } from "@/components/CreatorDashboard";
import { useFanvueTheme, useSession } from "@/lib/client";

export default function CreatorPage() {
  useFanvueTheme();
  const s = useSession<{ token: string }>("/api/auth/session", "sessionToken");
  if (s.status === "loading") return <Loader show center minHeight="100dvh" ariaLabel="Opening Askbox" />;
  if (s.status === "error") {
    const reconnect = s.error.code === "consent_required";
    return (
      <main className="mx-auto max-w-md p-6">
        <Alert variant="error" title={reconnect ? "Askbox needs your permission" : "Couldn't open Askbox"}>
          {reconnect ? "Approve Askbox's access in Fanvue, then open it again." : s.error.message}
        </Alert>
      </main>
    );
  }
  return (
    <main>
      <CreatorDashboard />
    </main>
  );
}
