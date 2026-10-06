import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of service · Askbox" };

const H = "typography-body-default-16px-semibold mt-8";
const P = "typography-body-default-16px-regular text-pretty text-content-secondary";

export default function Terms() {
  return (
    <article className="flex flex-col gap-3">
      <h1 className="typography-header-heading-md">Terms of service</h1>
      <p className={P}>Last updated 30 September 2026</p>

      <p className={P}>
        These terms cover your use of Askbox, an app for Fanvue run by Yoel Gal (“we”). By installing or using Askbox you agree to
        them, alongside Fanvue’s own terms, which always apply. Questions: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2 className={H}>The service</h2>
      <p className={P}>
        Askbox lets creators offer paid questions on their Fanvue profile and answer them by text or voice note. Fans pay through Fanvue;
        each creator sets their own prices. You need a Fanvue account and must be 18 or over.
      </p>

      <h2 className={H}>Payments and refunds</h2>
      <p className={P}>
        All payments are processed by Fanvue under Fanvue’s terms. Askbox never handles card details. A question stopped by the boundary
        check is never charged. Refunds and disputes go through Fanvue; if a payment is reversed, the question or tip is removed from
        Askbox.
      </p>

      <h2 className={H}>Creators</h2>
      <ul className={`${P} list-disc pl-5`}>
        <li>You are responsible for the answers you send and for keeping to Fanvue’s content policies.</li>
        <li>Reply times you set are shown to fans before they pay. Please answer within them, or pass on a question.</li>
        <li>
          AI drafts are suggestions for you to edit, and the boundary check can make mistakes. You decide what is sent, and you can
          pass on any question.
        </li>
      </ul>

      <h2 className={H}>Fans</h2>
      <p className={P}>
        Ask respectfully. Questions that harass, threaten, seek someone’s location or personal details, or ask for contact off Fanvue
        are blocked. Repeated abuse may be reported to Fanvue.
      </p>

      <h2 className={H}>Your data</h2>
      <p className={P}>
        How we handle personal data is set out in the <Link className="underline" href="/privacy">privacy policy</Link>. Creators can
        delete their Askbox data at any time from Settings.
      </p>

      <h2 className={H}>Availability and liability</h2>
      <p className={P}>
        We work to keep Askbox reliable but provide it “as is”, without guarantees that it will always be available or error free. To
        the extent the law allows, we are not liable for indirect losses or lost earnings, and our total liability is limited to the
        fees Askbox received from you in the previous 12 months. Nothing in these terms limits liability that cannot be limited by law.
      </p>

      <h2 className={H}>Ending use</h2>
      <p className={P}>
        You can stop using Askbox at any time by unpublishing and uninstalling it in Fanvue. We may suspend accounts that break these
        terms or Fanvue’s policies.
      </p>

      <h2 className={H}>Changes and law</h2>
      <p className={P}>
        We may update these terms and will change the date above when we do. These terms are governed by the law of England and Wales.
      </p>
    </article>
  );
}
