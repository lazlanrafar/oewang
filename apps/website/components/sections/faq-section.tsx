"use client";

import { useState } from "react";

const FAQS = [
  {
    question: "What is Oewang?",
    answer:
      "Oewang is a daily finance tracker for personal use. It brings transactions, wallets, receipts, and insights into one place so you always know where your money goes.",
  },
  {
    question: "Who is Oewang for?",
    answer:
      "Oewang is built for people in Indonesia who want to input and track daily spending, income, bills, receipts, and side-hustle money without spreadsheets.",
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
    answer: "Yes. You can upgrade or downgrade your plan at any time as your tracking needs change.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes. You can start free with Starter, then upgrade to Personal from Rp39.9k/month when you need more room.",
  },
  {
    question: "What plan is best for daily use?",
    answer:
      "Personal is the best-value daily plan: it adds unlimited wallets, daily spending insights, more AI quota, and more receipt storage at an Indonesia-friendly price.",
  },
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="bg-background py-12 sm:py-16 lg:py-24">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="mb-12 space-y-4 text-center">
          <h2 className="font-serif text-2xl text-foreground sm:text-3xl">Frequently asked questions</h2>
          <p className="mx-auto hidden max-w-2xl text-base text-muted-foreground leading-normal sm:block">
            Everything you need to know before getting started.
          </p>
        </div>

        <div className="mx-auto max-w-3xl space-y-2">
          {FAQS.map((faq, index) => (
            <div key={faq.question} className="border border-border bg-background">
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/40"
              >
                <span className="pr-6 text-foreground text-sm">{faq.question}</span>
                <span className="shrink-0 text-lg text-muted-foreground leading-none">
                  {openIndex === index ? "−" : "+"}
                </span>
              </button>
              {openIndex === index && (
                <div className="px-4 pb-4">
                  <p className="text-muted-foreground text-sm leading-relaxed">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
