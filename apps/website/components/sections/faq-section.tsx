"use client";

import { useState } from "react";

const FAQS = [
  {
    question: "What is Oewang?",
    answer:
      "Oewang is a financial workspace for founders and small teams. It brings transactions, wallets, and insights into one connected system so you always know what's happening in your business.",
  },
  {
    question: "Who is Oewang for?",
    answer:
      "Oewang is built for solo founders, freelancers, and small teams who want clarity and control over their business finances without spending time on manual admin or spreadsheets.",
  },
  {
    question: "Do I need accounting knowledge to use Oewang?",
    answer:
      "No. Oewang is designed for day-to-day non-financial users. It helps you stay organised and in control without requiring accounting expertise.",
  },
  {
    question: "What currencies does Oewang support?",
    answer:
      "Oewang supports over 150 currencies with live exchange rates. You can manage international finances, set a base currency, and track sub-currencies across all your wallets.",
  },
  {
    question: "How is my data protected?",
    answer:
      "Oewang protects data with encryption in transit and at rest, strict authentication, and workspace-based access controls. Users can only access data they own or data shared in workspaces they actively belong to.",
  },
  {
    question: "Can I export my data?",
    answer:
      "Yes. Your data is always yours. You can export transactions, reports, and financial summaries at any time.",
  },
  {
    question: "Can I change plans later?",
    answer:
      "Yes. You can upgrade or downgrade your plan at any time as your business grows or your needs change.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes. The Pro and Business plans include a 14-day free trial. No credit card is required for the Starter plan.",
  },
  {
    question: "How many team members can I invite?",
    answer:
      "The Starter plan supports 1 member, Pro supports up to 5, and Business has no member limit. You can manage roles and permissions from your workspace settings.",
  },
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="bg-background py-12 sm:py-16 lg:py-24">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-12">
          <h2 className="font-serif text-2xl sm:text-3xl text-foreground">
            Frequently asked questions
          </h2>
          <p className="hidden sm:block text-base text-muted-foreground leading-normal max-w-2xl mx-auto">
            Everything you need to know before getting started.
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-2">
          {FAQS.map((faq, index) => (
            <div
              key={faq.question}
              className="border border-border bg-background"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/40 transition-colors"
              >
                <span className="text-sm text-foreground pr-6">
                  {faq.question}
                </span>
                <span className="shrink-0 text-muted-foreground text-lg leading-none">
                  {openIndex === index ? "−" : "+"}
                </span>
              </button>
              {openIndex === index && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
