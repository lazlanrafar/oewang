"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
  Switch,
  ScrollArea,
  Checkbox,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui";
import { toast } from "sonner";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createPricingAction,
  updatePricingAction,
} from "@workspace/modules/pricing/pricing.action";
import type { Pricing } from "@workspace/types";
import { PRICING_FEATURES } from "@workspace/constants";
import { CURRENCY_CONFIG } from "@workspace/utils";

const pricingSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  prices: z
    .array(
      z.object({
        currency: z.string().min(1, "Currency is required"),
        monthly: z.coerce.number().min(0, "Price must be at least 0"),
        yearly: z.coerce.number().min(0, "Price must be at least 0"),
        xendit_monthly_id: z.string().optional(),
        xendit_yearly_id: z.string().optional(),
        xendit_product_id: z.string().optional(),
      }),
    )
    .min(1, "At least one currency price is required"),
  max_vault_size_mb: z.coerce.number().min(1, "Required").default(100),
  max_ai_tokens: z.coerce.number().min(1, "Required").default(100),
  is_active: z.boolean().default(true),
  features: z.array(z.string()).default([]),
});

type PricingFormValues = z.infer<typeof pricingSchema>;

interface PricingFormProps {
  initialData?: Pricing | null;
  onSuccess?: () => void;
}

export function PricingForm({ initialData, onSuccess }: PricingFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<PricingFormValues>({
    resolver: zodResolver(pricingSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      description: initialData?.description ?? "",
      prices:
        initialData?.prices && initialData.prices.length > 0
          ? initialData.prices.map((p) => {
              const config = CURRENCY_CONFIG[p.currency.toLowerCase()] || {
                divisor: 100,
              };
              return {
                ...p,
                monthly: p.monthly / config.divisor,
                yearly: p.yearly / config.divisor,
              };
            })
          : [
              {
                currency: "usd",
                monthly: 0,
                yearly: 0,
                xendit_monthly_id: "",
                xendit_yearly_id: "",
                xendit_product_id: "",
              },
              {
                currency: "eur",
                monthly: 0,
                yearly: 0,
                xendit_monthly_id: "",
                xendit_yearly_id: "",
                xendit_product_id: "",
              },
              {
                currency: "idr",
                monthly: 0,
                yearly: 0,
                xendit_monthly_id: "",
                xendit_yearly_id: "",
                xendit_product_id: "",
              },
            ],
      max_vault_size_mb: initialData?.max_vault_size_mb ?? 100,
      max_ai_tokens: initialData?.max_ai_tokens ?? 100,
      is_active: initialData?.is_active ?? true,
      features: initialData?.features ?? [],
    },
  });

  const { fields: priceFields } = useFieldArray({
    control: form.control,
    name: "prices",
  });

  async function onSubmit(values: PricingFormValues) {
    setIsLoading(true);
    try {
      const payload = {
        ...values,
        prices: values.prices.map((p) => {
          const config = CURRENCY_CONFIG[p.currency.toLowerCase()] || {
            divisor: 100,
          };
          return {
            ...p,
            monthly: Math.round(p.monthly * config.divisor),
            yearly: Math.round(p.yearly * config.divisor),
          };
        }),
      };

      if (initialData?.id) {
        await updatePricingAction(initialData.id, payload);
        toast.success("Pricing plan updated");
      } else {
        await createPricingAction(payload);
        toast.success("Pricing plan created");
      }

      router.refresh();
      onSuccess?.();
    } catch (error) {
      console.error(error);
      toast.error("Failed to save pricing plan");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="pb-24">
        <ScrollArea className="h-full">
          <div className="space-y-6">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Pro Plan" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the plan..."
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium">Pricing by Currency</h3>
              {priceFields.map((field, index) => (
                <Card key={field.id} className="shadow-sm">
                  <CardHeader className="py-3 px-4 border-b bg-muted/20">
                    <CardTitle className="text-sm font-medium uppercase tracking-wider">
                      {form.watch(`prices.${index}.currency`)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name={`prices.${index}.monthly`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Monthly Price
                          </FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`prices.${index}.yearly`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Yearly Price
                          </FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`prices.${index}.xendit_monthly_id`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Xendit Monthly ID (Optional)
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="plan_..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`prices.${index}.xendit_yearly_id`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Xendit Yearly ID (Optional)
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="plan_..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`prices.${index}.xendit_product_id`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Xendit Product ID (Addons)
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="prod_..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="max_vault_size_mb"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Storage (MB)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="max_ai_tokens"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max AI Tokens</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="features"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-base text-foreground">
                      Features
                    </FormLabel>
                    <div className="text-[0.8rem] text-muted-foreground">
                      Select the features included in this plan.
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {PRICING_FEATURES.map((item) => (
                      <FormField
                        key={item}
                        control={form.control}
                        name="features"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={item}
                              className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 shadow-sm bg-background"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(item)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...field.value, item])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== item,
                                          ),
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal text-sm cursor-pointer w-full leading-none m-0">
                                {item}
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Active Status</FormLabel>
                    <div className="text-[0.8rem] text-muted-foreground">
                      Whether this plan is visible to users.
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </ScrollArea>

        <div className="absolute bottom-0 w-full sm:max-w-[455px] right-0 p-4 border-t bg-background">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading
              ? "Saving..."
              : initialData
                ? "Update Plan"
                : "Create Plan"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
