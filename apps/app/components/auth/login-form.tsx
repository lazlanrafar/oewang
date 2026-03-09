"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Checkbox,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from "@workspace/ui";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { login } from "@workspace/modules/auth/auth.action";

const FormSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
  password: z
    .string()
    .min(6, { message: "Password must be at least 6 characters." }),
  remember: z.boolean().optional(),
});

export function LoginForm() {
  const [is_pending, start_transition] = useTransition();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema as any),
    defaultValues: {
      email: "",
      password: "",
      remember: false,
    },
  });

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    start_transition(async () => {
      const form_data = new FormData();
      form_data.append("email", data.email);
      form_data.append("password", data.password);

      const result = await login(form_data);
      if (result.success) {
        toast.success("Logged in successfully");
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
              <FormLabel>Email Address</FormLabel>
              <FormControl>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
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
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
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
              <FormLabel
                htmlFor="login-remember"
                className="ml-1 font-medium text-muted-foreground text-sm"
              >
                Remember me for 30 days
              </FormLabel>
            </FormItem>
          )}
        />
        <Button className="w-full" type="submit" disabled={is_pending}>
          {is_pending ? "Logging in..." : "Login"}
        </Button>
      </form>
    </Form>
  );
}
