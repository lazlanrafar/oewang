"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Dictionary } from "@workspace/dictionaries";
import { signup } from "@workspace/modules/auth/auth.action";
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input } from "@workspace/ui";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const getFormSchema = (dictionary: Dictionary) => {
  if (!dictionary) {
    return z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
        confirmPassword: z.string().min(6),
      })
      .refine((data) => data.password === data.confirmPassword, {
        path: ["confirmPassword"],
      });
  }
  return z
    .object({
      email: z.string().email({ message: dictionary.auth.form.validation.email_invalid }),
      password: z.string().min(6, { message: dictionary.auth.form.validation.password_min }),
      confirmPassword: z.string().min(6, { message: dictionary.auth.form.validation.password_min }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: dictionary.auth.form.validation.password_mismatch,
      path: ["confirmPassword"],
    });
};

export function RegisterForm({ dictionary }: { dictionary: Dictionary }) {
  const [is_pending, start_transition] = useTransition();

  const form = useForm<z.infer<ReturnType<typeof getFormSchema>>>({
    resolver: zodResolver(getFormSchema(dictionary)),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  if (!dictionary) return null;

  const onSubmit = async (data: z.infer<ReturnType<typeof getFormSchema>>) => {
    start_transition(async () => {
      const form_data = new FormData();
      form_data.append("email", data.email);
      form_data.append("password", data.password);

      const result = await signup(form_data);
      if (result.success) {
        toast.success(dictionary.auth.form.toasts.register_success, {
          description: "Please check your email to verify your account.",
        });
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{dictionary.auth.form.email_label}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder={dictionary.auth.form.email_placeholder}
                  autoComplete="email"
                  disabled={is_pending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{dictionary.auth.form.password_label}</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder={dictionary.auth.form.password_placeholder}
                  autoComplete="new-password"
                  disabled={is_pending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{dictionary.auth.form.confirm_password_label}</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder={dictionary.auth.form.password_placeholder}
                  autoComplete="new-password"
                  disabled={is_pending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className="w-full" type="submit" disabled={is_pending}>
          {is_pending ? dictionary.auth.form.registering : dictionary.auth.form.register_button}
        </Button>
      </form>
    </Form>
  );
}
