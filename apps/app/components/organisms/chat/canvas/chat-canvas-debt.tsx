"use client";

import {
  BaseCanvas,
  CanvasContent,
  CanvasGrid,
  CanvasHeader,
  CanvasSection,
  cn,
  shouldShowMetricsSkeleton,
  shouldShowSummarySkeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui";

import { useAppStore } from "@/stores/app";

import { formatAmount } from "../charts/format-amount";
import { getDictionaryText } from "../chat-i18n";
import { ArtifactTabs, useStaticArtifactData } from "./chat-canvas";

export function DebtCanvas({ dataOverride }: { dataOverride?: Record<string, unknown> | null } = {}) {
  const artifactData = useStaticArtifactData("debt-canvas") as Record<string, unknown> | null;
  const data = dataOverride ?? artifactData ?? {};
  const dictionary = useAppStore((state) => state.dictionary);
  const t = (key: string, fallback: string) => getDictionaryText(dictionary, key, fallback);
  const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";
  const currency = (data.currency as string) || "USD";
  const stage = data.stage as string | undefined;
  const metrics = (data.metrics as Record<string, unknown> | undefined) ?? {};
  const analysis = (data.analysis as Record<string, unknown> | undefined) ?? {};
  const debts = Array.isArray(data.debts) ? (data.debts as Record<string, unknown>[]) : [];

  const debtMetrics = Object.keys(metrics).length
    ? [
        {
          id: "payable",
          title: t("chat.canvas.debt.you_owe", "You owe"),
          value: formatAmount({
            amount: Number(metrics.totalPayable) || 0,
            currency,
            locale,
            maximumFractionDigits: 0,
          }),
          subtitle: t("chat.canvas.debt.total_payable", "Total payable"),
        },
        {
          id: "receivable",
          title: t("chat.canvas.debt.owed_to_you", "Owed to you"),
          value: formatAmount({
            amount: Number(metrics.totalReceivable) || 0,
            currency,
            locale,
            maximumFractionDigits: 0,
          }),
          subtitle: t("chat.canvas.debt.total_receivable", "Total receivable"),
        },
      ]
    : [];

  const showTable = stage && ["metrics_ready", "analysis_ready"].includes(stage);

  return (
    <BaseCanvas>
      <CanvasHeader tabs={<ArtifactTabs />} />

      <CanvasContent>
        <div className="space-y-8 pb-20">
          <CanvasGrid items={debtMetrics} layout="2/2" isLoading={shouldShowMetricsSkeleton(stage)} />

          {showTable && debts.length > 0 && (
            <div className="mb-6">
              <h4 className="mb-4 font-normal font-serif text-[18px] text-black dark:text-white">
                {t("chat.canvas.debt.outstanding", "Outstanding debts & receivables")}
              </h4>
              <Table>
                <TableHeader>
                  <TableRow className="border-b-0">
                    <TableHead className="font-normal text-[#707070] text-[12px] dark:text-[#666666]">
                      {t("chat.canvas.debt.contact", "Contact")}
                    </TableHead>
                    <TableHead className="font-normal text-[#707070] text-[12px] dark:text-[#666666]">
                      {t("chat.canvas.debt.type", "Type")}
                    </TableHead>
                    <TableHead className="w-[84px] whitespace-nowrap font-normal text-[#707070] text-[12px] dark:text-[#666666]">
                      {t("chat.canvas.debt.due", "Due")}
                    </TableHead>
                    <TableHead className="border-r text-right font-normal text-[#707070] text-[12px] dark:text-[#666666]">
                      {t("chat.canvas.common.amount", "Amount")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debts.slice(0, 20).map((debt, index) => {
                    const keyValue = debt.id;
                    const rowKey =
                      typeof keyValue === "string" || typeof keyValue === "number" ? String(keyValue) : index;
                    const type = String(debt.type ?? "");
                    const isPayable = type === "payable";
                    return (
                      <TableRow
                        key={rowKey}
                        className={cn(
                          "transition-colors hover:bg-[#F2F1EF] dark:hover:bg-[#0f0f0f]",
                          index === debts.slice(0, 20).length - 1 && "border-b-0",
                        )}
                      >
                        <TableCell className="max-w-[180px] truncate text-[12px] text-black dark:text-white">
                          {String(debt.contact ?? "—")}
                        </TableCell>
                        <TableCell className="text-[12px] text-[#707070] dark:text-[#666666]">
                          {isPayable
                            ? t("chat.canvas.debt.payable", "Payable")
                            : t("chat.canvas.debt.receivable", "Receivable")}
                        </TableCell>
                        <TableCell className="w-[84px] whitespace-nowrap text-[12px] text-black dark:text-white">
                          {String(debt.dueDate ?? "—")}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "border-r text-right font-sans text-[12px]",
                            isPayable ? "text-black dark:text-white" : "text-emerald-600 dark:text-emerald-500",
                          )}
                        >
                          {formatAmount({
                            amount: Number(debt.remaining) || 0,
                            currency,
                            locale,
                            maximumFractionDigits: 0,
                          })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <CanvasSection
            title={t("chat.canvas.common.summary", "Summary")}
            isLoading={shouldShowSummarySkeleton(stage)}
          >
            {String(analysis.summary ?? "")}
          </CanvasSection>
        </div>
      </CanvasContent>
    </BaseCanvas>
  );
}
