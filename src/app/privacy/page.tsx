// src/app/privacy/page.tsx
//
// A plain-language description of what this demo actually does with data. It is
// written from the code (what is stored, what is sent where), not generic
// boilerplate — keep it in sync if the app starts storing or sending anything new.

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What data the AdviShopping portfolio demo collects, where it goes, and what it does not do.',
};

const REPO = 'https://github.com/Varshini0511/AdviShopping1';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-100">Privacy</h1>
      <p className="mt-2 text-sm text-slate-400">
        AdviShopping is a <strong className="text-slate-300">portfolio demo</strong>, not a real store. No payments are taken
        and no orders are placed. This page says plainly what the demo does with data. It describes behaviour; it is not a
        legal contract.
      </p>

      <Section title="If you create an account">
        <p>
          Your <strong>email address</strong> and a <strong>hashed password</strong> are stored by Supabase (the
          authentication provider). Your cart, wishlist and saved-for-later items are stored against your account. Nothing
          else about you is collected: no name, address or phone number.
        </p>
        <p>
          The <strong>demo login</strong> is a shared account whose cart is cleared at the start of every demo session. Don&apos;t
          put anything personal in it.
        </p>
      </Section>

      <Section title="The shopping assistant">
        <p>
          What you type to the assistant is sent to <strong>Groq</strong>, a third-party AI provider, together with product
          information, so it can reply and take actions on your cart. The app does not save chat transcripts. Server logs
          may record search terms and which actions the assistant took, for debugging.
        </p>
        <p>Voice input uses your browser&apos;s built-in speech recognition, which may send audio to your browser vendor.</p>
      </Section>

      <Section title="Documents and images you upload">
        <p>
          Files uploaded to <Link href="/extract" className="text-indigo-400 underline underline-offset-4">Document AI</Link>{' '}
          or visual search are processed in memory and <strong>are not stored</strong>. For Document AI the content is sent
          to Groq&apos;s model to read it. Please don&apos;t upload real invoices or receipts containing personal or financial
          details; use the built-in samples.
        </p>
      </Section>

      <Section title="Cookies and tracking">
        <p>
          The only cookie is the sign-in session cookie set by Supabase when you log in. There is no analytics, advertising
          or tracking code.
        </p>
      </Section>

      <Section title="Who handles the data">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Render</strong>: hosts the app.
          </li>
          <li>
            <strong>Supabase</strong>: database and sign-in.
          </li>
          <li>
            <strong>Groq</strong>: the AI model behind the assistant, search summaries and Document AI.
          </li>
        </ul>
      </Section>

      <Section title="Deleting your data">
        <p>
          Account deletion isn&apos;t self-service yet. To have an account and its data removed, open an issue on the{' '}
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline underline-offset-4">
            project&apos;s GitHub repository
          </a>
          .
        </p>
      </Section>
    </div>
  );
}
