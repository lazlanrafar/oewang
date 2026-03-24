export * from "./default/category";
export * from "./default/wallet";
export * from "./roles";
export * from "./colors";
export * from "./pricing-features";
export * from "./transaction-types";
export * from "./artifact-config";
export * from "./chat-utils";
export * from "./tool-config";

import countriesJson from "./json/countries.json";

export const COUNTRIES = countriesJson;

export const WEEKLY_START_DAY_OPTIONS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const PERIOD_OPTIONS = ["Monthly", "Weekly", "Daily", "Yearly"] as const;

export const INCOME_EXPENSES_COLOR_OPTIONS = [
  {
    label: "Income: Blue, Expenses: Red",
    value: "blue-red",
    expensesColor: "text-red-600 dark:text-red-400",
    incomeColor: "text-blue-600 dark:text-blue-400",
  },
  {
    label: "Income: Red, Expenses: Blue",
    value: "red-blue",
    expensesColor: "text-blue-600 dark:text-blue-400",
    incomeColor: "text-red-600 dark:text-red-400",
  },
] as const;

export const TIME_INPUT_OPTIONS = [
  { label: "None", value: "None" },
  { label: "None, Desc.", value: "None, Desc." },
  { label: "Time", value: "Time" },
] as const;

export const START_SCREEN_OPTIONS = [
  "Daily",
  "Calendar",
  "Weekly",
  "Monthly",
  "Summary",
] as const;

export const SWIPE_ACTION_OPTIONS = ["Change Date", "Delete", "None"] as const;

export const INPUT_ORDER_OPTIONS = [
  { label: "From Amount", value: "Amount" },
  { label: "From Category", value: "Category" },
] as const;

export const MONTHLY_START_DATE_WEEKEND_HANDLING_OPTIONS = [
  { label: "No changes", value: "no-changes" },
  { label: "Previous Friday", value: "previous-friday" },
  { label: "Following Monday", value: "following-monday" },
] as const;

export * from "./app-config";
export * from "./env";
