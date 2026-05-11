"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Dictionary } from "@workspace/dictionaries";
import { login } from "@workspace/modules/auth/auth.action";
import { Button, Checkbox, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input } from "@workspace/ui";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const getFormSchema = (dictionary: Dictionary) => {
  if (!dictionary) {
    return z.object({
      email: z.string().email(),
      password: z.string().min(6),
      remember: z.boolean().optional(),
    });
  }
  return z.object({
    email: z.string().email({ message: dictionary.auth.form.validation.email_invalid }),
    password: z.string().min(6, { message: dictionary.auth.form.validation.password_min }),
    remember: z.boolean().optional(),
  });
};

export function LoginForm({ dictionary }: { dictionary: Dictionary }) {
  const [is_pending, start_transition] = useTransition();

  const auth_form = dictionary.auth.form;

  const form = useForm<z.infer<ReturnType<typeof getFormSchema>>>({
    resolver: zodResolver(getFormSchema(dictionary)),
    defaultValues: {
      email: "",
      password: "",
      remember: false,
    },
  });

  if (!dictionary || !auth_form) return null;

  const onSubmit = async (data: z.infer<ReturnType<typeof getFormSchema>>) => {
    start_transition(async () => {
      const form_data = new FormData();
      form_data.append("email", data.email);
      form_data.append("password", data.password);

      const result = await login(form_data);
      if (result.success) {
        toast.success(auth_form.toasts.login_success || "Logged in");
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
              <FormLabel>{auth_form.email_label}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder={auth_form.email_placeholder}
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
              <FormLabel>{auth_form.password_label}</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder={auth_form.password_placeholder}
                  autoComplete="current-password"
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
          name="remember"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center">
              <FormControl>
                <Checkbox
                  id="login-remember"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="size-4"
                  disabled={is_pending}
                />
              </FormControl>
              <FormLabel htmlFor="login-remember" className="ml-1 font-medium text-muted-foreground text-sm">
                {auth_form.remember_me}
              </FormLabel>
            </FormItem>
          )}
        />
        <Button className="w-full" type="submit" disabled={is_pending}>
          {is_pending ? auth_form.logging_in : auth_form.login_button}
        </Button>
      </form>
    </Form>
  );
}
