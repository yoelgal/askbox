import Link from "next/link";
import { CONTACT } from "@/lib/site";

// Public pages (home, privacy, terms). The app itself lives at /creator and /experience inside Fanvue.

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-dvh bg-background-primary text-content-primary">
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-12 px-6 py-10">
        <header>
          <Link href="/" className="inline-flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/askbox-icon.png" alt="" width={36} height={36} className="rounded-[9px]" />
            <span className="typography-header-heading-xs">Askbox</span>
          </Link>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="typography-body-small-14px-regular flex flex-wrap gap-x-5 gap-y-2 border-t border-neutral-alphas-200 pt-6 text-content-secondary">
          <Link href="/privacy" className="hover:text-content-primary">Privacy policy</Link>
          <Link href="/terms" className="hover:text-content-primary">Terms of service</Link>
          <a href={`mailto:${CONTACT}?subject=Askbox%20support`} className="hover:text-content-primary">Support</a>
          <a href={`mailto:${CONTACT}?subject=Askbox%20security%20report`} className="hover:text-content-primary">Report a security issue</a>
          <a href="https://www.fanvue.com/apps" className="hover:text-content-primary">Fanvue App Store</a>
        </footer>
      </div>
    </div>
  );
}
