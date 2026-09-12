"use client";

import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Textarea,
} from "@workspace/ui";
import { submitFeedbackAction } from "@workspace/modules/feedback/feedback.action";
import { Loader2, Upload, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

interface SettingFeedbackFormProps {
  dictionary: Dictionary;
}

export function SettingFeedbackForm({ dictionary }: SettingFeedbackFormProps) {
  const feedback = dictionary.settings.feedback;
  const [screenshot, setScreenshot] = React.useState<File | null>(null);

  const feedbackFormSchema = z.object({
    type: z.enum(["bug", "feature_request", "other"]),
    message: z.string().min(1, { message: feedback.message_error_min }),
  });

  type FeedbackFormValues = z.infer<typeof feedbackFormSchema>;

  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackFormSchema),
    defaultValues: { type: "bug", message: "" },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: FeedbackFormValues) => {
      const formData = new FormData();
      formData.append("type", data.type);
      formData.append("message", data.message);
      formData.append("source", "app");
      if (screenshot) formData.append("file", screenshot);

      const result = await submitFeedbackAction(formData);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success(feedback.toast_success);
      form.reset({ type: "bug", message: "" });
      setScreenshot(null);
    },
    onError: (error) => {
      toast.error(`${feedback.toast_error}: ${(error as Error).message}`);
    },
  });

  function onSubmit(data: FeedbackFormValues) {
    submitMutation.mutate(data);
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshot(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="font-medium text-lg tracking-tight">{feedback.title}</h2>
        <p className="text-muted-foreground text-xs">{feedback.description}</p>
      </div>
      <Separator className="rounded-none" />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{feedback.type_label}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full max-w-md rounded-none">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="rounded-none">
                    <SelectItem value="bug">{feedback.type_bug}</SelectItem>
                    <SelectItem value="feature_request">{feedback.type_feature_request}</SelectItem>
                    <SelectItem value="other">{feedback.type_other}</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{feedback.message_label}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={feedback.message_placeholder}
                    rows={5}
                    {...field}
                    className="max-w-md rounded-none"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-2">
            <FormLabel>{feedback.screenshot_label}</FormLabel>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept="image/*"
                className="hidden"
                id="feedback-screenshot-upload"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-none text-xs"
                onClick={() => (document.getElementById("feedback-screenshot-upload") as HTMLInputElement)?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {feedback.screenshot_upload}
              </Button>
              {screenshot && (
                <span className="flex items-center gap-1 text-muted-foreground text-xs">
                  {screenshot.name}
                  <button
                    type="button"
                    onClick={() => setScreenshot(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">{feedback.screenshot_allowed_formats}</p>
          </div>

          <Button type="submit" disabled={submitMutation.isPending} className="h-8 rounded-none text-xs">
            {submitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitMutation.isPending ? feedback.submitting : feedback.submit}
          </Button>
        </form>
      </Form>
    </div>
  );
}
