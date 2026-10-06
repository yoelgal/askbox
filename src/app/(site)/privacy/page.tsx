import type { Metadata } from "next";
import { CONTACT } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy · Askbox" };

const H = "typography-body-default-16px-semibold mt-8";
const P = "typography-body-default-16px-regular text-pretty text-content-secondary";

export default function Privacy() {
  return (
    <article className="flex flex-col gap-3">
      <h1 className="typography-header-heading-md">Privacy policy</h1>
      <p className={P}>Last updated 30 September 2026</p>

      <p className={P}>
        Askbox is an app for Fanvue creators that lets fans pay to ask questions. It is run by Yoel Gal (“we”), who is the data
        controller for the information described here. Contact: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2 className={H}>What we collect</h2>
      <ul className={`${P} list-disc pl-5`}>
        <li>
          <strong>Creators:</strong> your Fanvue user ID, handle, display name and profile photo URL (from Fanvue when you connect),
          your Fanvue access tokens (stored encrypted), and the settings you enter: how you write, your boundaries, reply times and
          brand theme.
        </li>
        <li>
          <strong>Fans:</strong> your Fanvue user ID and display name, the questions you ask, the tier, whether you allow the answer to
          be shown publicly, and purchase references and amounts for questions and tips. Your name is never shown to other fans.
        </li>
        <li>
          <strong>Answers:</strong> the text and voice notes creators send back.
        </li>
      </ul>
      <p className={P}>
        We do not collect card or payment details: all payments are handled by Fanvue. We do not use advertising or tracking cookies,
        and we do not sell or share data for marketing.
      </p>

      <h2 className={H}>How we use it</h2>
      <ul className={`${P} list-disc pl-5`}>
        <li>To run the service: show questions to the creator, deliver answers to fans, and record payments and tips (legal basis: performing our contract with you).</li>
        <li>
          To check each question against the creator’s boundaries before the fan pays, and to draft answers in the creator’s style when
          they ask for one (legal basis: our legitimate interest in keeping creators and fans safe, and performing the contract).
        </li>
        <li>To send the fan a Fanvue message when their question is answered.</li>
      </ul>

      <h2 className={H}>Who processes it</h2>
      <ul className={`${P} list-disc pl-5`}>
        <li><strong>Fanvue</strong>: sign-in, payments and messaging.</li>
        <li><strong>Vercel</strong> (hosting, running in London) and <strong>Neon</strong> (database, stored in London).</li>
        <li>
          <strong>OpenRouter and Anthropic</strong> (AI): the text of a question, the creator’s boundaries and writing notes, and past
          answers are sent to Claude to screen questions and write drafts. Anthropic does not train its models on API data by default.
        </li>
      </ul>
      <p className={P}>
        The app and its database run in London. AI requests are processed in the United States; those transfers rely on the providers’ standard contractual clauses.
      </p>

      <h2 className={H}>How long we keep it</h2>
      <p className={P}>
        We keep a creator’s Askbox data until they delete it or ask us to. Fanvue access tokens are replaced as they refresh and removed
        on deletion. Questions a fan starts but never pays for hold no payment data.
      </p>

      <h2 className={H}>Your rights and deleting your data</h2>
      <p className={P}>
        You can ask to access, correct, export or delete your data, or object to how we use it. Creators can delete everything Askbox
        holds for them at any time in Askbox under <strong>Settings → Your data → Delete my Askbox data</strong>. Fans, or anyone who
        prefers email, can write to <a className="underline" href={`mailto:${CONTACT}?subject=Askbox%20data%20request`}>{CONTACT}</a>{" "}
        and we will act on the request within 30 days. You can also complain to the UK Information Commissioner’s Office (ico.org.uk).
      </p>

      <h2 className={H}>Security</h2>
      <p className={P}>
        Everything is served over HTTPS. Fanvue tokens are encrypted at rest, secrets stay on the server, and only the operator can
        access creator data, to run and support the app. Report a vulnerability to{" "}
        <a className="underline" href={`mailto:${CONTACT}?subject=Askbox%20security%20report`}>{CONTACT}</a>.
      </p>

      <h2 className={H}>Age</h2>
      <p className={P}>Askbox is only for Fanvue users aged 18 or over.</p>

      <h2 className={H}>Changes</h2>
      <p className={P}>If this policy changes, we will update the date above.</p>
    </article>
  );
}
