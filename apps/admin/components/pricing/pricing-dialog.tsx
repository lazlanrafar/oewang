"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Pricing } from "@workspace/types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Switch,
  Textarea,
} from "@workspace/ui";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { createPricingAction, updatePricingAction } from "@workspace/modules";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price_monthly: z.coerce.number().min(0).optional(),
  price_yearly: z.coerce.number().min(0).optional(),
  price_one_time: z.coerce.number().min(0).optional(),
  is_active: z.boolean().default(true),
  features: z.array(z.string()).default([]),
});

export interface PricingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pricing?: Pricing;
}

export function PricingDialog({
  open,
  onOpenChange,
  pricing,
}: PricingDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const isEdit = !!pricing;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      price_monthly: 0,
      price_yearly: 0,
      price_one_time: 0,
      is_active: true,
      features: [],
    },
  });

  useEffect(() => {
    if (open && pricing) {
      form.reset({
        name: pricing.name,
        description: pricing.description || "",
        price_monthly: pricing.price_monthly ?? 0,
        price_yearly: pricing.price_yearly ?? 0,
        price_one_time: pricing.price_one_time ?? 0,
        is_active: pricing.is_active,
        features: pricing.features || [],
      });
    } else if (open && !pricing) {
      form.reset({
        name: "",
        description: "",
        price_monthly: 0,
        price_yearly: 0,
        price_one_time: 0,
        is_active: true,
        features: [],
      });
    }
  }, [open, pricing, form]);

  const [featureInput, setFeatureInput] = useState("");

  const addFeature = () => {
    if (!featureInput.trim()) return;
    const currentFeatures = form.getValues("features");
    form.setValue("features", [...currentFeatures, featureInput.trim()]);
    setFeatureInput("");
  };

  const removeFeature = (index: number) => {
    const currentFeatures = form.getValues("features");
    form.setValue(
      "features",
      currentFeatures.filter((_, i) => i !== index),
    );
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);

    try {
      const payload = {
        ...values,
        currency: "usd", // Defaulting to USD for now as requested
        // Parse 0 back to null or keep it depending on DB preference, Drizzle permits null.
        price_monthly: values.price_monthly || undefined,
        price_yearly: values.price_yearly || undefined,
        price_one_time: values.price_one_time || undefined,
      };

      if (isEdit) {
        const result = await updatePricingAction(pricing.id, payload);
        if (result.success) {
          onOpenChange(false);
          router.refresh();
        } else {
          alert(result.error);
        }
      } else {
        const result = await createPricingAction(payload);
        if (result.success) {
          onOpenChange(false);
          router.refresh();
        } else {
          alert(result.error);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Pricing Plan" : "Create Pricing Plan"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plan Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Pro Tier" {...field} />
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
                      placeholder="Brief description of this plan"
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
                    <FormLabel>Monthly (cents)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
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
                    <FormLabel>Yearly (cents)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
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
                    <FormLabel>Lifetime (cents)</FormLabel>
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
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Features</FormLabel>
                  <div className="flex gap-2 mb-2">
                    <Input
                      placeholder="Add a new feature..."
                      value={featureInput}
                      onChange={(e) => setFeatureInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addFeature();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      onClick={addFeature}
                      variant="secondary"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {field.value.map((feat, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-muted px-3 py-2 rounded-md text-sm"
                      >
                        <span>{feat}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => removeFeature(idx)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
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
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active Status</FormLabel>
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

            <div className="flex justify-end gap-4 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Saving..." : "Save Plan"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
