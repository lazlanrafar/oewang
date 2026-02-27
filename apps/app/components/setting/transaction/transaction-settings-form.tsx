"use client";

import * as React from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  INCOME_EXPENSES_COLOR_OPTIONS,
  INPUT_ORDER_OPTIONS,
  MONTHLY_START_DATE_WEEKEND_HANDLING_OPTIONS,
  PERIOD_OPTIONS,
  START_SCREEN_OPTIONS,
  SWIPE_ACTION_OPTIONS,
  TIME_INPUT_OPTIONS,
  WEEKLY_START_DAY_OPTIONS,
} from "@workspace/constants";
import {
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Switch,
} from "@workspace/ui";
import { toast } from "sonner";

import { getTransactionSettings, updateTransactionSettings } from "@workspace/modules";
import type { TransactionSettings } from "@workspace/types";

interface TransactionSettingsFormProps {
  dictionary: {
    settings: {
      transaction: {
        title: string;
        description: string;
        date_time: {
          title: string;
          description: string;
          monthly_start_date: {
            label: string;
            description: string;
            placeholder: string;
          };
          weekend_handling: {
            label: string;
            options: Record<string, string>;
          };
          weekly_start_day: {
            label: string;
            description: string;
            placeholder: string;
            options: Record<string, string>;
          };
        };
        general: {
          title: string;
          description: string;
          default_period: {
            label: string;
            description: string;
            placeholder: string;
            options: Record<string, string>;
          };
          start_screen: {
            label: string;
            description: string;
            placeholder: string;
            options: Record<string, string>;
          };
          income_expense_color: {
            description: string;
            options: Record<string, string>;
          };
        };
        input_interaction: {
          title: string;
          description: string;
          carry_over: {
            label: string;
            description: string;
          };
          autocomplete: {
            label: string;
            description: string;
          };
          time_input: {
            label: string;
            description: string;
            placeholder: string;
            options: Record<string, string>;
          };
          swipe_action: {
            label: string;
            description: string;
            placeholder: string;
            options: Record<string, string>;
          };
          input_order: {
            label: string;
            description: string;
            placeholder: string;
            options: Record<string, string>;
          };
          show_description: {
            label: string;
            description: string;
          };
          quick_note_button: {
            label: string;
            description: string;
          };
        };
      };
    };
  };
}

export function TransactionSettingsForm({ dictionary }: TransactionSettingsFormProps) {
  const { transaction } = dictionary.settings;
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings", "transaction"],
    queryFn: async () => {
      const result = await getTransactionSettings();
      if (result.success) return result.data;
      throw new Error(result.error);
    },
  });

  const mutation = useMutation({
    mutationFn: async (vars: Partial<TransactionSettings>) => {
      const result = await updateTransactionSettings(vars);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "transaction"] });
      toast.success("Settings updated");
    },
    onError: () => {
      toast.error("Failed to update settings");
    },
  });

  const updateSetting = (key: keyof TransactionSettings, value: any) => {
    mutation.mutate({ [key]: value });
  };

  if (isLoading || !settings) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((section, i) => (
          <React.Fragment key={i}>
            <div className="space-y-4">
              <div>
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-4 w-64" />
              </div>
              <div className="space-y-4">
                {[1, 2, 3].map((row) => (
                  <div key={row} className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-10 w-[180px]" />
                  </div>
                ))}
              </div>
            </div>
            {i < 2 && <Skeleton className="h-px w-full" />}
          </React.Fragment>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date & Time Settings */}
      <div className="space-y-4">
        <div>
          <h4 className="text-base font-medium">{transaction.date_time.title}</h4>
          <p className="text-sm text-muted-foreground">{transaction.date_time.description}</p>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">{transaction.date_time.monthly_start_date.label}</Label>
              <p className="text-xs text-muted-foreground">{transaction.date_time.monthly_start_date.description}</p>
            </div>
            <Select
              value={settings.monthlyStartDate?.toString()}
              onValueChange={(val) => updateSetting("monthlyStartDate", parseInt(val))}
            >
              <SelectTrigger className="w-[180px] cursor-pointer">
                <SelectValue placeholder={transaction.date_time.monthly_start_date.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((date) => (
                  <SelectItem key={date} value={date.toString()} className="cursor-pointer">
                    {date}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3 pt-1">
            <Label className="text-sm text-muted-foreground font-normal">
              {transaction.date_time.weekend_handling.label}
            </Label>
            <RadioGroup
              value={settings.monthlyStartDateWeekendHandling}
              onValueChange={(val) => updateSetting("monthlyStartDateWeekendHandling", val)}
              className="space-y-1"
            >
              {MONTHLY_START_DATE_WEEKEND_HANDLING_OPTIONS.map((option) => (
                <div className="flex items-center space-x-2" key={option.value}>
                  <RadioGroupItem value={option.value} id={`handling-${option.value}`} />
                  <Label htmlFor={`handling-${option.value}`} className="font-normal cursor-pointer text-sm">
                    {transaction.date_time.weekend_handling.options[option.value] || option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">{transaction.date_time.weekly_start_day.label}</Label>
              <p className="text-xs text-muted-foreground">{transaction.date_time.weekly_start_day.description}</p>
            </div>
            <Select value={settings.weeklyStartDay} onValueChange={(val) => updateSetting("weeklyStartDay", val)}>
              <SelectTrigger className="w-[180px] cursor-pointer">
                <SelectValue placeholder={transaction.date_time.weekly_start_day.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {WEEKLY_START_DAY_OPTIONS.map((day) => (
                  <SelectItem key={day} value={day} className="cursor-pointer">
                    {transaction.date_time.weekly_start_day.options[day.toLowerCase()] || day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <Separator />

      {/* General Preferences */}
      <div className="space-y-4">
        <div>
          <h4 className="text-base font-medium">{transaction.general.title}</h4>
          <p className="text-sm text-muted-foreground">{transaction.general.description}</p>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">{transaction.general.default_period.label}</Label>
              <p className="text-xs text-muted-foreground">{transaction.general.default_period.description}</p>
            </div>
            <Select value={settings.period} onValueChange={(val) => updateSetting("period", val)}>
              <SelectTrigger className="w-[180px] cursor-pointer">
                <SelectValue placeholder={transaction.general.default_period.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((period) => (
                  <SelectItem key={period} value={period} className="cursor-pointer">
                    {transaction.general.default_period.options[period.toLowerCase()] || period}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">{transaction.general.start_screen.label}</Label>
              <p className="text-xs text-muted-foreground">{transaction.general.start_screen.description}</p>
            </div>
            <Select value={settings.startScreen} onValueChange={(val) => updateSetting("startScreen", val)}>
              <SelectTrigger className="w-[180px] cursor-pointer">
                <SelectValue placeholder={transaction.general.start_screen.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {START_SCREEN_OPTIONS.map((screen) => (
                  <SelectItem key={screen} value={screen} className="cursor-pointer">
                    {transaction.general.start_screen.options[screen.toLowerCase()] || screen}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 pt-1">
            <Label className="text-sm text-muted-foreground font-normal">
              {transaction.general.income_expense_color.description}
            </Label>
            <RadioGroup
              value={settings.incomeExpensesColor}
              onValueChange={(val) => updateSetting("incomeExpensesColor", val)}
              className="space-y-2"
            >
              {INCOME_EXPENSES_COLOR_OPTIONS.map((option) => (
                <div key={option.value} className="flex flex-col space-y-2">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value={option.value} id={`color-${option.value}`} />
                    <Label htmlFor={`color-${option.value}`} className="font-normal cursor-pointer text-sm">
                      {transaction.general.income_expense_color.options[option.value] || option.label}
                    </Label>
                  </div>

                  <div className="flex items-center">
                    <div className="ml-6 border rounded-md p-2 w-full max-w-[100px] bg-card text-xs font-medium">
                      <span className={option.expensesColor}>Exp.</span>
                    </div>
                    <div className="ml-6 border rounded-md p-2 w-full max-w-[100px] bg-card text-xs font-medium">
                      <span className={option.incomeColor}>Inc.</span>
                    </div>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>
      </div>
      <Separator />

      {/* Input & Interaction */}
      <div className="space-y-4">
        <div>
          <h4 className="text-base font-medium">{transaction.input_interaction.title}</h4>
          <p className="text-sm text-muted-foreground">{transaction.input_interaction.description}</p>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">{transaction.input_interaction.carry_over.label}</Label>
              <p className="text-xs text-muted-foreground">{transaction.input_interaction.carry_over.description}</p>
            </div>
            <Switch
              checked={settings.carryOver}
              onCheckedChange={(val) => updateSetting("carryOver", val)}
              className="cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">{transaction.input_interaction.autocomplete.label}</Label>
              <p className="text-xs text-muted-foreground">{transaction.input_interaction.autocomplete.description}</p>
            </div>
            <Switch
              checked={settings.autocomplete}
              onCheckedChange={(val) => updateSetting("autocomplete", val)}
              className="cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">{transaction.input_interaction.time_input.label}</Label>
              <p className="text-xs text-muted-foreground">{transaction.input_interaction.time_input.description}</p>
            </div>
            <Select value={settings.timeInput} onValueChange={(val) => updateSetting("timeInput", val)}>
              <SelectTrigger className="w-[180px] cursor-pointer">
                <SelectValue placeholder={transaction.input_interaction.time_input.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {TIME_INPUT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="cursor-pointer">
                    {/* Map values strictly. Some have special chars like ','. I need lowercased keys in dict */}
                    {transaction.input_interaction.time_input.options[
                      option.value.toLowerCase().replace(", ", "-").replace(/\./, "")
                    ] || option.label}
                    {/* Wait, the values in constant are "None", "None, Desc.", "Time" */}
                    {/* In dict I put "none", "none-desc", "time" */}
                    {/* I should normalise the key lookup */}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">{transaction.input_interaction.swipe_action.label}</Label>
              <p className="text-xs text-muted-foreground">{transaction.input_interaction.swipe_action.description}</p>
            </div>
            <Select value={settings.swipeAction} onValueChange={(val) => updateSetting("swipeAction", val)}>
              <SelectTrigger className="w-[180px] cursor-pointer">
                <SelectValue placeholder={transaction.input_interaction.swipe_action.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {SWIPE_ACTION_OPTIONS.map((action) => (
                  <SelectItem key={action} value={action} className="cursor-pointer">
                    {/* Values: "Change Date", "Delete", "None" -> "change-date", "delete", "none" */}
                    {transaction.input_interaction.swipe_action.options[action.toLowerCase().replace(" ", "-")] ||
                      action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">{transaction.input_interaction.input_order.label}</Label>
              <p className="text-xs text-muted-foreground">{transaction.input_interaction.input_order.description}</p>
            </div>
            <Select value={settings.inputOrder} onValueChange={(val) => updateSetting("inputOrder", val)}>
              <SelectTrigger className="w-[180px] cursor-pointer">
                <SelectValue placeholder={transaction.input_interaction.input_order.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {INPUT_ORDER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="cursor-pointer">
                    {/* Values: "Amount", "Category" -> "amount", "category" */}
                    {transaction.input_interaction.input_order.options[option.value.toLowerCase()] || option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">{transaction.input_interaction.show_description.label}</Label>
              <p className="text-xs text-muted-foreground">
                {transaction.input_interaction.show_description.description}
              </p>
            </div>
            <Switch
              checked={settings.showDescription}
              onCheckedChange={(val) => updateSetting("showDescription", val)}
              className="cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">{transaction.input_interaction.quick_note_button.label}</Label>
              <p className="text-xs text-muted-foreground">
                {transaction.input_interaction.quick_note_button.description}
              </p>
            </div>
            <Switch
              checked={settings.noteButton}
              onCheckedChange={(val) => updateSetting("noteButton", val)}
              className="cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
