import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function PolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <Link
        href={`/`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
      >
        <ArrowLeft className="mr-2 size-4" />
        Back to home
      </Link>

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-serif tracking-tight mb-2">
            Privacy Policy
          </h1>
          <p className="text-muted-foreground text-sm">
            Last updated: April 22, 2026
          </p>
        </div>

        <div className="h-px w-full bg-border my-8" />

        <section className="space-y-4">
          <p className="text-muted-foreground leading-6 text-sm">
            This Privacy Policy explains how oewang ("oewang", "we", "our",
            or "us") collects, uses, stores, and protects personal data when
            you use our product and website.
          </p>
          <p className="text-muted-foreground leading-6 text-sm">
            oewang is built to help founders and teams manage business
            finances, including transactions, wallets, invoices, documents, and
            AI-assisted workflows. Privacy and workspace data isolation are
            core design principles in the product.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg tracking-tight mt-10">
            Data We Collect
          </h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground leading-6 text-sm">
            <li>
              Account data: name, email, profile details, authentication
              provider information.
            </li>
            <li>
              Workspace data: workspace name, membership, role, and settings.
            </li>
            <li>
              Financial data you provide: transactions, wallets, categories,
              contacts, debts, invoices, and related records.
            </li>
            <li>
              Files you upload: receipts, invoice files, and other documents
              stored in vault features.
            </li>
            <li>
              Integration data: data required to operate connected services
              (for example messaging or email integrations you enable).
            </li>
            <li>
              Technical and security data: request metadata, audit records,
              operational logs, and abuse prevention signals.
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg tracking-tight mt-10">
            How We Use Data
          </h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground leading-6 text-sm">
            <li>Deliver and maintain the product.</li>
            <li>Authenticate users and protect accounts/workspaces.</li>
            <li>Process financial workflows and generate reports/insights.</li>
            <li>Provide support and troubleshoot service issues.</li>
            <li>Improve reliability, security, and product quality.</li>
            <li>Meet legal, tax, audit, and compliance obligations.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg tracking-tight mt-10">
            Workspace Access and Visibility
          </h2>
          <p className="text-muted-foreground leading-6 text-sm">
            oewang enforces workspace-scoped access controls. Authenticated
            requests are validated against active workspace membership, and
            access is limited by role and permission.
          </p>
          <p className="text-muted-foreground leading-6 text-sm">
            Users can only access data they own or data available inside
            workspaces where they are active members. Access is revoked when
            membership is removed.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg tracking-tight mt-10">
            Legal Bases (GDPR)
          </h2>
          <p className="text-muted-foreground leading-6 text-sm">
            For users in the EEA/UK, we process personal data based on one or
            more of the following:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground leading-6 text-sm">
            <li>Contract necessity: to provide the oewang service.</li>
            <li>Legitimate interests: security, fraud prevention, reliability.</li>
            <li>Legal obligations: accounting, tax, and regulatory duties.</li>
            <li>Consent: where required for optional processing activities.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg tracking-tight mt-10">
            Third-Party Processors and Integrations
          </h2>
          <p className="text-muted-foreground leading-6 text-sm">
            We use third-party service providers to operate the product (for
            example authentication/database infrastructure, payment processing,
            cloud storage, messaging channels, and AI providers). These
            providers process data on our behalf under contractual controls.
          </p>
          <p className="text-muted-foreground leading-6 text-sm">
            If you connect optional integrations, data is processed as required
            to deliver that integration's functionality. We do not sell your
            personal data.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg tracking-tight mt-10">
            Google API Data
          </h2>
          <p className="text-muted-foreground leading-6 text-sm">
            If you connect Google services, oewang's use of data received from
            Google APIs follows the Google API Services User Data Policy,
            including Limited Use requirements.
          </p>
          <p className="text-muted-foreground leading-6 text-sm">
            Data obtained from Google Workspace APIs (including Gmail data) is
            not used to train generalized AI/ML models.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg tracking-tight mt-10">
            International Data Transfers
          </h2>
          <p className="text-muted-foreground leading-6 text-sm">
            Your data may be processed in countries outside your place of
            residence. Where required, we apply appropriate transfer safeguards
            under applicable law.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg tracking-tight mt-10">
            Data Retention
          </h2>
          <p className="text-muted-foreground leading-6 text-sm">
            We keep personal data for as long as needed to provide the service,
            maintain security, and comply with legal obligations. Retention
            periods vary by data type and legal requirements.
          </p>
          <p className="text-muted-foreground leading-6 text-sm">
            When retention is no longer required, we delete or anonymize data
            according to our internal controls.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg tracking-tight mt-10">
            Security
          </h2>
          <p className="text-muted-foreground leading-6 text-sm">
            We apply technical and organizational security measures, including
            encryption in transit, encrypted storage where supported,
            authenticated access control, role-based authorization, and audit
            logging.
          </p>
          <p className="text-muted-foreground leading-6 text-sm">
            No system is 100% secure, but we continuously review and improve
            our controls.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg tracking-tight mt-10">
            Your Privacy Rights
          </h2>
          <p className="text-muted-foreground leading-6 text-sm">
            Privacy rights vary by region. Depending on where you live, you may
            have rights to access, correct, export, restrict, erase, or object
            to certain uses of your personal data.
          </p>

          <h3 className="text-base mt-6">
            Indonesia (UU PDP)
          </h3>
          <p className="text-muted-foreground leading-6 text-sm">
            For users in Indonesia, we process personal data in line with
            Indonesia's Personal Data Protection Law (UU PDP). Subject to legal
            conditions, you may request access, correction, deletion,
            restriction, and other rights recognized by applicable Indonesian
            law.
          </p>

          <h3 className="text-base mt-6">
            EEA / UK (GDPR)
          </h3>
          <p className="text-muted-foreground leading-6 text-sm">
            For users in the EEA/UK, GDPR-related rights may include access,
            rectification, erasure, restriction, portability, objection, and
            complaint rights with a supervisory authority, subject to legal
            limitations.
          </p>

          <h3 className="text-base mt-6">
            United States (State Privacy Laws)
          </h3>
          <p className="text-muted-foreground leading-6 text-sm">
            For users in certain US states, you may have rights to know, access,
            correct, delete, and request a portable copy of personal data, and
            where applicable, rights to opt out of specific processing uses
            defined by state law.
          </p>

          <p className="text-muted-foreground leading-6 text-sm">
            oewang supports a structured privacy request workflow. Requests are
            tracked through lifecycle states (received, in progress, completed,
            rejected) and may require identity verification.
          </p>
          <p className="text-muted-foreground leading-6 text-sm">
            Where required by law, we aim to respond within applicable
            statutory deadlines (typically within 30 days, subject to
            complexity and legal allowances).
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg tracking-tight mt-10">
            Children's Privacy
          </h2>
          <p className="text-muted-foreground leading-6 text-sm">
            oewang is not intended for children under 18, and we do not
            knowingly collect personal data from children under 18.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg tracking-tight mt-10">
            Changes to This Policy
          </h2>
          <p className="text-muted-foreground leading-6 text-sm">
            We may update this Privacy Policy from time to time. Material
            updates will be posted on this page with a revised "Last updated"
            date.
          </p>
        </section>

        <section className="space-y-4 mb-20">
          <h2 className="text-lg tracking-tight mt-10">
            Contact
          </h2>
          <p className="text-muted-foreground leading-6 text-sm">
            For privacy questions or requests, contact us at{" "}
            <a
              className="underline hover:text-foreground transition-colors"
              href="mailto:support@oewang.com"
            >
              support@oewang.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
