import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return createPageMetadata({
    locale,
    path: "/terms",
    title: "Terms and conditions",
    description:
      "Read Oewang's terms and conditions for subscriptions, accounts, content, financial disclaimers, liability, and service usage.",
    keywords: ["Oewang terms", "terms and conditions", "finance app terms"],
  });
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <Link
        href={locale === "en" ? "/" : `/${locale}`}
        className="mb-8 inline-flex items-center text-muted-foreground text-sm transition-colors hover:text-foreground"
      >
        <ArrowLeft className="mr-2 size-4" />
        Back to home
      </Link>

      <div className="space-y-6">
        <div>
          <h1 className="mb-2 font-serif text-2xl tracking-tight">Terms and Conditions</h1>
          <p className="text-muted-foreground text-sm">Last updated: {new Date().toLocaleDateString()}</p>
        </div>

        <div className="my-8 h-px w-full bg-border" />

        <section className="space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">1. Subscriptions</h2>
          <p className="text-muted-foreground text-sm leading-6">
            Some parts of the Service are billed on a subscription basis ("Subscription(s)"). You will be billed in
            advance on a recurring and periodic basis ("Billing Cycle"). Billing cycles are set on a monthly basis.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            At the end of each Billing Cycle, your Subscription will automatically renew under the same conditions
            unless you cancel it or Oewang cancels it. You may cancel your Subscription through your online account
            management page or by contacting Oewang's customer support.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            A valid payment method, including a credit card, is required. You must provide accurate and complete billing
            information. By submitting payment information, you authorize us to charge Subscription fees to your chosen
            payment method.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            If automatic billing fails, Oewang will issue an invoice and require manual payment within a stated
            deadline.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">2. Fee Changes</h2>
          <p className="text-muted-foreground text-sm leading-6">
            Oewang may modify Subscription fees at its sole discretion. Any changes will take effect at the end of the
            current Billing Cycle.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            We will provide reasonable prior notice of any changes. Continued use of the Service after fee changes take
            effect constitutes your agreement to the new fees.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">3. Refunds</h2>
          <p className="text-muted-foreground text-sm leading-6">
            Refund requests may be considered on a case-by-case basis and are granted at the sole discretion of Oewang.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">4. Content</h2>
          <p className="text-muted-foreground text-sm leading-6">
            Our Service may allow you to post, link, store, share, and otherwise make available various information
            ("Content"). You are responsible for the legality, reliability, and appropriateness of any Content you post.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            By posting Content, you grant us a license to use, modify, display, reproduce, and distribute it on the
            Service. You retain ownership of your Content and are responsible for protecting your rights.
          </p>
          <p className="text-muted-foreground text-sm leading-6">You warrant that:</p>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground text-sm leading-6">
            <li>You own or have rights to the Content,</li>
            <li>Posting the Content does not violate any rights of others.</li>
          </ul>
          <p className="text-muted-foreground text-sm leading-6">
            Oewang does not verify the accuracy or suitability of any financial or tax-related Content shared through
            the Service. Use of such Content is at your own risk.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">5. Accounts</h2>
          <p className="text-muted-foreground text-sm leading-6">
            When you create an account, you must provide accurate, complete, and current information. Failure to do so
            constitutes a breach of these Terms.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            You are responsible for safeguarding your password and all activity under your account. You agree not to
            disclose your password to any third party and to notify us of any unauthorized use.
          </p>
          <p className="text-muted-foreground text-sm leading-6">You may not use a username that:</p>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground text-sm leading-6">
            <li>Belongs to someone else without authorization,</li>
            <li>Is not lawfully available,</li>
            <li>Is offensive, vulgar, or obscene.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">6. Financial and Tax Disclaimer</h2>
          <p className="text-muted-foreground text-sm leading-6">
            Oewang is not a financial advisor, accountant, or tax consultant. All content and functionality within the
            Service are provided for general informational purposes only and do not constitute financial, legal, or tax
            advice.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            You are solely responsible for complying with all applicable financial and tax regulations, including local
            reporting obligations. We strongly recommend verifying all decisions and data with your local tax authority
            or a qualified professional.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            Oewang accepts no liability for any consequences, losses, or penalties resulting from your use of the
            Service for financial or tax purposes.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">7. Copyright Policy</h2>
          <p className="text-muted-foreground text-sm leading-6">
            We respect intellectual property rights and respond to claims of copyright or other IP infringement.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            If you believe your work has been used in a way that constitutes infringement, please reach out to support
            with:
          </p>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground text-sm leading-6">
            <li>A detailed description of the material,</li>
            <li>Identification of the copyrighted work,</li>
            <li>Your contact details,</li>
            <li>A good-faith statement of unauthorized use.</li>
          </ul>
          <p className="text-muted-foreground text-sm leading-6">
            False claims may result in legal liability, including damages and attorney's fees.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">8. Intellectual Property</h2>
          <p className="text-muted-foreground text-sm leading-6">
            The Service and its original content (excluding Content provided by users), features, and functionality are
            and remain the property of Oewang and its licensors.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            Our trademarks and trade dress may not be used without prior written permission.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">9. Links to Other Websites</h2>
          <p className="text-muted-foreground text-sm leading-6">
            The Service may contain links to third-party websites or services that are not controlled by Oewang.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            We assume no responsibility for third-party content, privacy policies, or practices. You agree that Oewang
            shall not be liable for any loss or damage caused by use of such content or services.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            Please review the terms and policies of any third-party websites you visit.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">10. Termination</h2>
          <p className="text-muted-foreground text-sm leading-6">
            We may terminate or suspend your account without prior notice for any reason, including violation of these
            Terms.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            Upon termination, your right to use the Service will cease immediately. You may also terminate your account
            at any time by discontinuing use of the Service.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">11. Limitation of Liability</h2>
          <p className="text-muted-foreground text-sm leading-6">
            Oewang and its affiliates, directors, employees, and suppliers shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages, including:
          </p>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground text-sm leading-6">
            <li>Loss of profits, data, or goodwill,</li>
            <li>Errors or delays in third-party data,</li>
            <li>Unauthorized access or use of your Content,</li>
            <li>Any use of the Service.</li>
          </ul>
          <p className="text-muted-foreground text-sm leading-6">
            This limitation applies even if a remedy fails of its essential purpose.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">12. Disclaimer</h2>
          <p className="text-muted-foreground text-sm leading-6">
            You use the Service at your own risk. The Service is provided on an "AS IS" and "AS AVAILABLE" basis,
            without warranties of any kind.
          </p>
          <p className="text-muted-foreground text-sm leading-6">We do not warrant that:</p>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground text-sm leading-6">
            <li>The Service will be secure, timely, or error-free,</li>
            <li>Any defects will be corrected,</li>
            <li>The Service is free of viruses or harmful components,</li>
            <li>The results will meet your requirements,</li>
            <li>Third-party data or integrations will be reliable.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">13. Governing Law</h2>
          <p className="text-muted-foreground text-sm leading-6">
            These Terms are governed by the laws of your jurisdiction, without regard to its conflict of law rules.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            Failure to enforce any part of the Terms does not waive our rights. If any provision is found to be invalid,
            the remainder remains in effect.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            These Terms constitute the entire agreement between you and Oewang regarding the Service.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">14. Changes</h2>
          <p className="text-muted-foreground text-sm leading-6">
            We reserve the right to modify or replace these Terms at any time. Material changes will be announced at
            least 30 days before they take effect.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            By continuing to use the Service after changes are effective, you agree to be bound by the new terms. If you
            do not agree, please stop using the Service.
          </p>
        </section>

        <section className="mb-20 space-y-4">
          <h2 className="mt-10 text-lg tracking-tight">15. Contact Us</h2>
          <p className="text-muted-foreground text-sm leading-6">
            For questions regarding these Terms, contact us through our administrative support channels.
          </p>
        </section>
      </div>
    </div>
  );
}
