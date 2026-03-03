"use client";

import { useForm } from "react-hook-form";
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
} from "@workspace/ui";
import { toast } from "sonner";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPricingAction, updatePricingAction } from "@workspace/modules";
import type { Pricing } from "@workspace/types";

const pricingSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  price_monthly: z.coerce.number().min(0, "Price must be at least 0"),
  price_yearly: z.coerce.number().min(0, "Price must be at least 0"),
  price_one_time: z.coerce
    .number()
    .min(0, "Price must be at least 0")
    .default(0),
  currency: z.string().min(1, "Currency is required"),
  is_active: z.boolean().default(true),
  features: z.string().optional(), // We'll parse this as string[] on submit
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
      price_monthly: (initialData?.price_monthly ?? 0) / 100,
      price_yearly: (initialData?.price_yearly ?? 0) / 100,
      price_one_time: (initialData?.price_one_time ?? 0) / 100,
      currency: initialData?.currency ?? "usd",
      is_active: initialData?.is_active ?? true,
      features: initialData?.features?.join("\n") ?? "",
    },
  });

  async function onSubmit(values: PricingFormValues) {
    setIsLoading(true);
    try {
      const payload = {
        ...values,
        price_monthly: Math.round(values.price_monthly * 100),
        price_yearly: Math.round(values.price_yearly * 100),
        price_one_time: Math.round((values.price_one_time || 0) * 100),
        features: values.features
          ? values.features.split("\n").filter((f) => f.trim())
          : [],
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="price_monthly"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Monthly Price</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="price_yearly"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Yearly Price</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="price_one_time"
            render={({ field }) => (
              <FormItem>
                <FormLabel>One-Time Price</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Currency</FormLabel>
              <FormControl>
                <Input placeholder="usd" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="features"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Features (one per line)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Unlimited users&#10;Priority support"
                  rows={5}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="is_active"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <FormLabel>Active</FormLabel>
                <div className="text-[0.8rem] text-muted-foreground">
                  Whether this plan is available for selection.
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

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading
            ? "Saving..."
            : initialData
              ? "Update Plan"
              : "Create Plan"}
        </Button>
      </form>
    </Form>
  );
}
