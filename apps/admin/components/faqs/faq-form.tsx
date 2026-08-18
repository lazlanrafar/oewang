"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { createFaqAction, updateFaqAction } from "@workspace/modules/faq/faq.action";
import type { Faq } from "@workspace/types";
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  ScrollArea,
  Switch,
  Textarea,
} from "@workspace/ui";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

const faqSchema = z.object({
  question: z.string().min(1, "Question is required").max(500),
  answer: z.string().min(1, "Answer is required"),
  category: z.string().optional(),
  sort_order: z.coerce.number().default(0),
  published: z.boolean().default(true),
});

type FaqFormValues = z.infer<typeof faqSchema>;

interface FaqFormProps {
  initialData?: Faq | null;
  onSuccess?: () => void;
}

export function FaqForm({ initialData, onSuccess }: FaqFormProps) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FaqFormValues>({
    resolver: zodResolver(faqSchema),
    defaultValues: {
      question: initialData?.question ?? "",
      answer: initialData?.answer ?? "",
      category: initialData?.category ?? "",
      sort_order: initialData?.sort_order ?? 0,
      published: initialData?.published ?? true,
    },
  });

  async function onSubmit(values: FaqFormValues) {
    setIsLoading(true);
    try {
      const result = initialData?.id ? await updateFaqAction(initialData.id, values) : await createFaqAction(values);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(initialData ? "FAQ updated" : "FAQ created");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-faqs"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-faqs-stats"] }),
      ]);
      onSuccess?.();
    } catch (error) {
      console.error(error);
      toast.error("Failed to save FAQ");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="pb-24">
        <ScrollArea className="h-full">
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="question"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Question</FormLabel>
                  <FormControl>
                    <Input placeholder="How does Oewang..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="answer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Answer</FormLabel>
                  <FormControl>
                    <Textarea rows={6} placeholder="Write the answer..." className="resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Billing" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sort_order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
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
              name="published"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Published</FormLabel>
                    <div className="text-[0.8rem] text-muted-foreground">
                      Whether this FAQ shows on the marketing site.
                    </div>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </ScrollArea>

        <div className="absolute right-0 bottom-0 w-full border-t bg-background p-4 sm:max-w-[455px]">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Saving..." : initialData ? "Update FAQ" : "Create FAQ"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
