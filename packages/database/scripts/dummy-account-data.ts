/**
 * One-off dev script: generates a large, varied set of demo data (transactions,
 * debts, contacts, budgets) for a single account, spread across the last 6
 * months so calendar/analysis views have realistic-looking activity to show.
 * Usage: bun run packages/database/scripts/dummy-account-data.ts <email>
 */

import * as path from "node:path";
import * as dotenv from "dotenv";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
}

import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../client";
import { budgets } from "../schema/budgets";
import { categories } from "../schema/categories";
import { contacts } from "../schema/contacts";
import { debts } from "../schema/debts";
import { transactions } from "../schema/transactions";
import { user_workspaces } from "../schema/user-workspaces";
import { users } from "../schema/users";
import { wallets } from "../schema/wallets";

const EMAIL = process.argv[2] || "lazlanrafar@gmail.com";

function pick<T>(arr: T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (item === undefined) throw new Error("pick() called on empty array");
  return item;
}

function amount(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) / 500) * 500;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function toTimestamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

async function main() {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, EMAIL))
    .limit(1);
  if (!user) throw new Error(`No user found for ${EMAIL}`);

  const [membership] = await db
    .select({ workspaceId: user_workspaces.workspace_id })
    .from(user_workspaces)
    .where(eq(user_workspaces.user_id, user.id))
    .limit(1);
  if (!membership) throw new Error(`No workspace found for ${EMAIL}`);
  const workspaceId = membership.workspaceId;

  const walletRows = await db
    .select({ id: wallets.id, name: wallets.name })
    .from(wallets)
    .where(and(eq(wallets.workspaceId, workspaceId), isNull(wallets.deletedAt)));
  if (walletRows.length === 0) throw new Error("No wallets found — expected default wallets to already exist");

  const categoryRows = await db
    .select({ id: categories.id, name: categories.name, type: categories.type })
    .from(categories)
    .where(and(eq(categories.workspaceId, workspaceId), isNull(categories.deletedAt)));

  const cat = (type: "expense" | "income", keyword: string) => {
    const row = categoryRows.find((c) => c.type === type && c.name.includes(keyword));
    if (!row) throw new Error(`Category not found: ${type}/${keyword}`);
    return row;
  };
  const wallet = (keyword: string) => {
    const row = walletRows.find((w) => w.name.includes(keyword)) ?? walletRows[0]!;
    return row;
  };

  console.log(`🌱 Generating dummy data for ${EMAIL} (workspace ${workspaceId})...`);

  // ── Contacts (for debts) ────────────────────────────────────────────────
  const contactNames = [
    "Budi Santoso",
    "Dewi Anggraini",
    "Rian Pratama",
    "Sinta Wulandari",
    "Agus Setiawan",
    "Maya Kusuma",
    "Fajar Nugroho",
    "Indah Permatasari",
  ];
  const contactRows = await db
    .insert(contacts)
    .values(contactNames.map((name) => ({ id: createId(), workspaceId, name })))
    .returning({ id: contacts.id, name: contacts.name });
  console.log(`  ✓ ${contactRows.length} contacts`);

  // ── Transactions — 6 months of varied activity ──────────────────────────
  const txRows: (typeof transactions.$inferInsert)[] = [];

  for (let monthOffset = 5; monthOffset >= 0; monthOffset--) {
    // Recurring monthly income
    txRows.push({
      id: createId(),
      workspaceId,
      walletId: wallet("Accounts").id,
      categoryId: cat("income", "Salary").id,
      amount: String(amount(8_000_000, 12_000_000)),
      date: toTimestamp(daysAgo(monthOffset * 30 + Math.floor(Math.random() * 3))),
      type: "income",
      name: "Monthly Salary",
      isReady: true,
    });

    // Recurring monthly expenses
    txRows.push(
      {
        id: createId(),
        workspaceId,
        walletId: wallet("Accounts").id,
        categoryId: cat("expense", "Rent").id,
        amount: String(amount(1_200_000, 1_800_000)),
        date: toTimestamp(daysAgo(monthOffset * 30 + 2)),
        type: "expense",
        name: "Monthly Rent",
        isReady: true,
      },
      {
        id: createId(),
        workspaceId,
        walletId: wallet("Card").id,
        categoryId: cat("expense", "Internet").id,
        amount: String(amount(300_000, 450_000)),
        date: toTimestamp(daysAgo(monthOffset * 30 + 5)),
        type: "expense",
        name: "Internet Bill",
        isReady: true,
      },
      {
        id: createId(),
        workspaceId,
        walletId: wallet("Card").id,
        categoryId: cat("expense", "Subscription").id,
        amount: String(amount(120_000, 250_000)),
        date: toTimestamp(daysAgo(monthOffset * 30 + 8)),
        type: "expense",
        name: pick(["Netflix", "YouTube Premium", "Spotify"]),
        isReady: true,
      },
    );

    // Occasional freelance income (1-2x/month)
    const freelanceCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < freelanceCount; i++) {
      txRows.push({
        id: createId(),
        workspaceId,
        walletId: wallet("Accounts").id,
        categoryId: cat("income", "Freelance").id,
        amount: String(amount(500_000, 3_000_000)),
        date: toTimestamp(daysAgo(monthOffset * 30 + Math.floor(Math.random() * 28))),
        type: "income",
        name: pick(["Freelance Project", "Client Payment", "Side Gig"]),
        isReady: true,
      });
    }

    // Frequent small expenses (coffee/food/transport) — ~20/month
    const smallExpenses: { keyword: string; names: string[]; min: number; max: number }[] = [
      { keyword: "Coffee", names: ["Kopi Kenangan", "Starbucks", "Fore Coffee", "Tuku"], min: 18_000, max: 45_000 },
      { keyword: "Food", names: ["Ayam Geprek", "Nasi Padang", "GoFood Order", "Warteg", "Sushi Tei"], min: 15_000, max: 120_000 },
      { keyword: "Transport", names: ["Gojek Ride", "Grab Ride", "MRT Ticket", "Parking Fee"], min: 10_000, max: 60_000 },
    ];
    for (let i = 0; i < 20; i++) {
      const group = pick(smallExpenses);
      txRows.push({
        id: createId(),
        workspaceId,
        walletId: pick([wallet("Cash"), wallet("Card")]).id,
        categoryId: cat("expense", group.keyword).id,
        amount: String(amount(group.min, group.max)),
        date: toTimestamp(daysAgo(monthOffset * 30 + Math.floor(Math.random() * 28))),
        type: "expense",
        name: pick(group.names),
        isReady: true,
      });
    }

    // Sprinkle across every other category for variety — 1 per category/month
    const varietyExpenses: { keyword: string; names: string[]; min: number; max: number }[] = [
      { keyword: "Apparel", names: ["Uniqlo", "H&M", "Zara"], min: 150_000, max: 800_000 },
      { keyword: "Beauty", names: ["Sociolla Order", "Skincare Set"], min: 80_000, max: 400_000 },
      { keyword: "Health", names: ["Pharmacy", "Clinic Visit", "Gym Fee"], min: 50_000, max: 500_000 },
      { keyword: "Household", names: ["IKEA", "Ace Hardware", "Groceries Restock"], min: 100_000, max: 600_000 },
      { keyword: "Hobby", names: ["Bookstore", "Gaming Store", "Hobby Supplies"], min: 50_000, max: 500_000 },
      { keyword: "Sport", names: ["Futsal Rental", "Badminton Court", "Sport Gear"], min: 50_000, max: 300_000 },
      { keyword: "Social Life", names: ["Dinner with Friends", "Movie Night", "Karaoke"], min: 100_000, max: 500_000 },
      { keyword: "Education", names: ["Online Course", "Udemy Purchase", "Books"], min: 100_000, max: 700_000 },
      { keyword: "Pets", names: ["Pet Food", "Vet Visit"], min: 50_000, max: 400_000 },
      { keyword: "Gift", names: ["Birthday Gift", "Wedding Gift"], min: 100_000, max: 500_000 },
      { keyword: "Laundry", names: ["Laundry Service"], min: 20_000, max: 80_000 },
      { keyword: "Motorbikes", names: ["Fuel", "Motorbike Service"], min: 30_000, max: 300_000 },
    ];
    for (const group of varietyExpenses) {
      if (Math.random() > 0.6) continue; // not every category every month — keeps it realistic, not exhaustive
      txRows.push({
        id: createId(),
        workspaceId,
        walletId: pick([wallet("Cash"), wallet("Card"), wallet("Accounts")]).id,
        categoryId: cat("expense", group.keyword).id,
        amount: String(amount(group.min, group.max)),
        date: toTimestamp(daysAgo(monthOffset * 30 + Math.floor(Math.random() * 28))),
        type: "expense",
        name: pick(group.names),
        isReady: true,
      });
    }

    // One wallet-to-wallet transfer per month
    txRows.push({
      id: createId(),
      workspaceId,
      walletId: wallet("Accounts").id,
      toWalletId: wallet("Cash").id,
      categoryId: null,
      amount: String(amount(500_000, 2_000_000)),
      date: toTimestamp(daysAgo(monthOffset * 30 + 15)),
      type: "transfer",
      name: "Cash Withdrawal",
      isReady: true,
    });
  }

  // Rare bonus income (2 over the 6-month window)
  txRows.push(
    {
      id: createId(),
      workspaceId,
      walletId: wallet("Accounts").id,
      categoryId: cat("income", "Bonus").id,
      amount: String(amount(2_000_000, 6_000_000)),
      date: toTimestamp(daysAgo(45)),
      type: "income",
      name: "Year-End Bonus",
      isReady: true,
    },
    {
      id: createId(),
      workspaceId,
      walletId: wallet("Accounts").id,
      categoryId: cat("income", "Bonus").id,
      amount: String(amount(1_000_000, 3_000_000)),
      date: toTimestamp(daysAgo(120)),
      type: "income",
      name: "Performance Bonus",
      isReady: true,
    },
  );

  await db.insert(transactions).values(txRows);
  console.log(`  ✓ ${txRows.length} transactions across 6 months`);

  // ── Debts — mix of payable/receivable, spread past/present/future ──────
  const debtSpecs: {
    type: "payable" | "receivable";
    status: "unpaid" | "partial" | "paid";
    amount: number;
    dueOffsetDays: number; // negative = past, positive = future
  }[] = [
    { type: "payable", status: "unpaid", amount: 800_000, dueOffsetDays: 30 },
    { type: "payable", status: "unpaid", amount: 500_000, dueOffsetDays: 10 },
    { type: "payable", status: "partial", amount: 1_500_000, dueOffsetDays: -5 },
    { type: "payable", status: "paid", amount: 300_000, dueOffsetDays: -20 },
    { type: "payable", status: "unpaid", amount: 2_000_000, dueOffsetDays: 45 },
    { type: "receivable", status: "unpaid", amount: 700_000, dueOffsetDays: 15 },
    { type: "receivable", status: "partial", amount: 1_200_000, dueOffsetDays: -10 },
    { type: "receivable", status: "paid", amount: 400_000, dueOffsetDays: -30 },
    { type: "receivable", status: "unpaid", amount: 150_000, dueOffsetDays: 3 },
    { type: "receivable", status: "unpaid", amount: 900_000, dueOffsetDays: 60 },
    { type: "payable", status: "unpaid", amount: 250_000, dueOffsetDays: -3 }, // overdue
    { type: "receivable", status: "partial", amount: 600_000, dueOffsetDays: 20 },
  ];

  const debtRows = debtSpecs.map((spec) => {
    const remaining = spec.status === "paid" ? 0 : spec.status === "partial" ? spec.amount * 0.4 : spec.amount;
    return {
      id: createId(),
      workspaceId,
      contactId: pick(contactRows).id,
      type: spec.type,
      amount: String(spec.amount),
      remainingAmount: String(remaining),
      status: spec.status,
      dueDate: toTimestamp(new Date(Date.now() + spec.dueOffsetDays * 24 * 60 * 60 * 1000)),
      description: spec.type === "payable" ? pick(["Borrowed cash", "Split bill", "Loan"]) : pick(["Lent money", "Owed for dinner", "Loan given"]),
    };
  });
  await db.insert(debts).values(debtRows);
  console.log(`  ✓ ${debtRows.length} debts (payable + receivable, varied status/due dates)`);

  // ── Budgets — a few common categories ───────────────────────────────────
  const budgetSpecs = [
    { keyword: "Food", amount: 2_000_000 },
    { keyword: "Coffee", amount: 500_000 },
    { keyword: "Transport", amount: 800_000 },
    { keyword: "Subscription", amount: 300_000 },
    { keyword: "Rent", amount: 2_000_000 },
  ];
  await db.insert(budgets).values(
    budgetSpecs.map((b) => ({
      id: createId(),
      workspaceId,
      categoryId: cat("expense", b.keyword).id,
      amount: String(b.amount),
      period: "monthly",
    })),
  );
  console.log(`  ✓ ${budgetSpecs.length} monthly budgets`);

  console.log("✅ Dummy data generated.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
