"use client";

import { useCallback, useEffect, useState } from "react";

// Both surfaces run in Fanvue iframes. The fan one is sandboxed without
// allow-same-origin, so no cookies or storage: the session JWT lives in memory.
let jwt: string | null = null;
// "Preview as a fan" runs a fan session beside the creator's own, so fan routes
// get the preview token while everything else keeps the creator's.
let previewJwt: string | null = null;
const tokenFor = (path: string) => (previewJwt && path.startsWith("/api/experience") ? previewJwt : jwt);
// Inside the /demo page, both views sit in frames side by side: a change in one
// (a payment, an answer) tells the page, which refreshes the other.
let demoMode = false;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: {
      ...(tokenFor(path) ? { authorization: `Bearer ${tokenFor(path)}` } : {}),
      ...(init?.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? "error", e.message ?? "Something went wrong. Try again.");
  }
  if (demoMode && init?.method && init.method !== "GET" && window.parent !== window) {
    const b = init.body as { action?: string; kind?: string } | undefined;
    window.parent.postMessage({ type: "askbox:demo-changed", path, action: b?.action ?? b?.kind ?? null }, window.location.origin);
  }
  return data as T;
}

/** In the demo, reload when the other view changed something. */
function useDemoRefresh(load: () => unknown) {
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === "askbox:demo-refresh") load();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [load]);
}

/** GETs a route; reloads on demand, and in the demo when the other view changed something. */
export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(
    () =>
      api<T>(path).then(
        (d) => {
          setData(d);
          setError(null);
        },
        (e: ApiError) => setError(e.message),
      ),
    [path],
  );
  useEffect(() => {
    reload();
  }, [reload]);
  useDemoRefresh(reload);
  return { data, error, reload };
}

/** Runs one async action at a time: which one is in flight, and the error to show if it failed. */
export function useAction<K extends string = "busy">() {
  const [pending, setPending] = useState<K | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(key: K, fn: () => Promise<unknown>) {
    setPending(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setPending(null);
    }
  }
  return { run, pending, error, setError };
}

/** Authed binary fetch, for voice answers (an <audio> tag can't send a bearer header). */
export async function apiBlob(path: string) {
  const res = await fetch(path, { headers: jwt ? { authorization: `Bearer ${jwt}` } : {} });
  if (!res.ok) throw new ApiError(res.status, "error", "Couldn't load this voice answer.");
  return res.blob();
}

export const blobToBase64 = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

export const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** "12 hours", "3 days": how a reply promise reads to a fan. */
export const promise = (hours: number) =>
  hours % 24 === 0 ? `${hours / 24} day${hours === 24 ? "" : "s"}` : `${hours} hour${hours === 1 ? "" : "s"}`;

/** The current time, refreshed each minute so due-by countdowns stay live. */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const params = () => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
export const inFanvue = () => typeof window !== "undefined" && window.parent !== window;

/** Follows Fanvue's light/dark (passed as ?theme=) so the iframe matches its host. */
export function useFanvueTheme() {
  useEffect(() => {
    const t = params().get("theme") === "light" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.toggle("dark", t === "dark");
    root.style.colorScheme = t;
  }, []);
}

export type Boot<T> = { status: "loading" } | { status: "ready"; data: T; demo: boolean } | { status: "error"; error: ApiError };

/**
 * Exchanges the launch token Fanvue put on the URL (or, outside Fanvue, asks
 * for a demo session) and keeps the resulting JWT for later calls.
 */
export function useSession<T extends { token?: string }>(endpoint: string, tokenField: "sessionToken" | "experienceToken") {
  const [state, setState] = useState<Boot<T>>({ status: "loading" });
  useEffect(() => {
    const p = params();
    const token = p.get("token");
    const body = token ? { [tokenField]: token } : { dev: true, demo: p.get("demo") };
    demoMode = !token;
    // Strip the single-use token so a reload can't try to replay it.
    if (token) {
      p.delete("token");
      history.replaceState(null, "", `${location.pathname}${p.size ? `?${p}` : ""}`);
    }
    api<T>(endpoint, { method: "POST", body })
      .then((data) => {
        if (data.token) jwt = data.token;
        setState({ status: "ready", data, demo: !token });
      })
      .catch((error: ApiError) => setState({ status: "error", error }));
  }, [endpoint, tokenField]);
  return state;
}

/** For "preview as a fan": a fan session minted from the creator's, used alongside it. */
export async function previewAsFan() {
  const data = await api<{ token: string }>("/api/experience/session", { method: "POST", body: { preview: true } });
  previewJwt = data.token;
  return () => {
    previewJwt = null;
  };
}

// --- Fanvue host messages -----------------------------------------------------

const isFanvueOrigin = (origin: string) => {
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && (u.hostname === "fanvue.com" || u.hostname.endsWith(".fanvue.com"));
  } catch {
    return false;
  }
};

/**
 * Posts a request to the Fanvue page hosting us and resolves with the first
 * matching reply. Replies are checked for origin and shape; a result is UX
 * only, so anything that matters is re-verified on the server.
 */
export function askHost<R extends { type: string }>(
  message: Record<string, unknown>,
  resultType: string,
  match: (data: R) => boolean = () => true,
  timeoutMs = 10 * 60_000,
): Promise<R> {
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      if (!isFanvueOrigin(e.origin) || e.data?.type !== resultType || !match(e.data)) return;
      cleanup();
      resolve(e.data as R);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Fanvue didn't respond. Try again."));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
    window.addEventListener("message", onMessage);
    // Fanvue answers with targetOrigin "*" and we can't know which Fanvue host
    // framed us; the message carries nothing secret.
    window.parent.postMessage(message, "*");
  });
}

// --- Formatting ---------------------------------------------------------------

export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function ago(ms: number) {
  const s = (ms - Date.now()) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

export function duration(ms: number) {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export const firstName = (displayName: string) => displayName.split(" ")[0]!;

export const initials = (name: string) =>
  name
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
