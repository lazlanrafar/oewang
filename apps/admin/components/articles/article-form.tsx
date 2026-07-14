"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { createArticleAction, updateArticleAction } from "@workspace/modules/article/article.action";
import type { Article } from "@workspace/types";
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
import { Editor } from "@workspace/ui/organisms";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

const articleSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  slug: z.string().optional(),
  excerpt: z.string().optional(),
  content: z.string().optional(),
  cover_image: z.string().optional(),
  published: z.boolean().default(false),
});

type ArticleFormValues = z.infer<typeof articleSchema>;

interface ArticleFormProps {
  initialData?: Article | null;
  onSuccess?: () => void;
}

export function ArticleForm({ initialData, onSuccess }: ArticleFormProps) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ArticleFormValues>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      title: initialData?.title ?? "",
      slug: initialData?.slug ?? "",
      excerpt: initialData?.excerpt ?? "",
      content: initialData?.content ?? "",
      cover_image: initialData?.cover_image ?? "",
      published: initialData?.published ?? false,
    },
  });

  async function onSubmit(values: ArticleFormValues) {
    setIsLoading(true);
    try {
      // On create, drop an empty slug so the API derives one from the title.
      const payload = { ...values, slug: values.slug || undefined };

      const result = initialData?.id
        ? await updateArticleAction(initialData.id, payload)
        : await createArticleAction(payload);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(initialData ? "Article updated" : "Article created");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-articles"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-articles-stats"] }),
      ]);
      onSuccess?.();
    } catch (error) {
      console.error(error);
      toast.error("Failed to save article");
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
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Article title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="auto-generated from title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="excerpt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Excerpt (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Short summary shown on article cards..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cover_image"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cover Image URL (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content</FormLabel>
                  <FormControl>
                    <div className="min-h-[240px] rounded-md border p-3">
                      <Editor
                        initialContent={field.value || ""}
                        placeholder="Write the article..."
                        onUpdate={(editor) => field.onChange(editor.isEmpty ? "" : editor.getHTML())}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="published"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Published</FormLabel>
                    <div className="text-[0.8rem] text-muted-foreground">Whether this article is live on the blog.</div>
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
            {isLoading ? "Saving..." : initialData ? "Update Article" : "Create Article"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
