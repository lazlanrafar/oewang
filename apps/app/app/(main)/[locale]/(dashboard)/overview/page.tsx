import {
  getBurnRateMetrics,
  getCategoryBreakdown,
  getExpenseMetrics,
  getRevenueMetrics,
  getTransactionSettings,
  getMe,
} from "@workspace/modules/server";

import { ChatProviderWrapper } from "@/components/organisms/chat/chat-provider-wrapper";
import ChatInterface from "@/components/organisms/chat/chat-interface";
import { OverviewClient } from "@/components/organisms/overview/overview-client";

export default async function OverviewPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const initialTab =
    typeof searchParams.tab === "string" ? searchParams.tab : "overview";

  const [
    meResult,
    incomeResult,
    expenseResult,
    burnRateResult,
    settingsResult,
    expenseCategoryResult,
    incomeCategoryResult,
  ] = await Promise.all([
    getMe(),
    getRevenueMetrics(),
    getExpenseMetrics(),
    getBurnRateMetrics(),
    getTransactionSettings(),
    getCategoryBreakdown("expense"),
    getCategoryBreakdown("income"),
  ]);

  const user = meResult.success ? meResult.data?.user : null;
  const displayName = user?.name
    ? user.name.split(" ")[0]
    : (user?.email?.split("@")[0] ?? "there");

  const incomeData = incomeResult.success ? incomeResult.data! : [];
  const expenseData = expenseResult.success ? expenseResult.data! : [];
  const burnRateData = burnRateResult.success ? burnRateResult.data! : [];
  const expenseCategoryData = expenseCategoryResult.success
    ? expenseCategoryResult.data!
    : [];
  const incomeCategoryData = incomeCategoryResult.success
    ? incomeCategoryResult.data!
    : [];
  const settings = settingsResult.success ? settingsResult.data! : null;

  return (
    <ChatProviderWrapper key={"home"}>
      <div className="flex flex-1 flex-col">
        <OverviewClient
          defaultTab={initialTab}
          displayName={displayName}
          incomeData={incomeData}
          expenseData={expenseData}
          burnRateData={burnRateData}
          expenseCategoryData={expenseCategoryData}
          incomeCategoryData={incomeCategoryData}
          settings={settings}
        />

        <ChatInterface />
      </div>
    </ChatProviderWrapper>
  );
}
