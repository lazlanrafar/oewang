"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@workspace/ui";
import { Loader2, UserPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { inviteMember } from "@workspace/modules/workspace/workspace.action";
import { useAppStore } from "@/stores/app";

const inviteSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  role: z.enum(["admin", "member"]),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

interface InviteMemberDialogProps {
  onSuccess?: () => void;
}

export function InviteMemberDialog({ onSuccess }: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { dictionary } = useAppStore();

  if (!dictionary) return null;

  const dict = dictionary.settings.members;

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema as any),
    defaultValues: { email: "", role: "member" },
  });

  async function onSubmit(values: InviteFormValues) {
    setLoading(true);
    const result = await inviteMember(values.email, values.role);
    setLoading(false);

    if (result.success) {
      toast.success(dict.form.success || "Invitation sent!", {
        description:
          dict.form.description?.replace("{email}", values.email) ||
          `${values.email} will receive an invite shortly.`,
      });
      setOpen(false);
      form.reset();
      onSuccess?.();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        onClick={() => setOpen(true)}
        className="rounded-none h-8 text-xs"
      >
        <UserPlus className="h-4 w-4 mr-2" />
        {dict.invite_button}
      </Button>

      <DialogContent className="rounded-none sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium">
            {dict.invite_button}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {dict.description}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6 py-4"
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">
                    {dict.form.email.label}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={dict.form.email.placeholder}
                      {...field}
                      className="rounded-none text-sm h-10 px-3"
                    />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">
                    {dict.form.role.label}
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="rounded-none h-10 px-3 text-sm">
                        <SelectValue placeholder={dict.form.role.placeholder} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-none">
                      <SelectItem
                        value="member"
                        className="rounded-none text-xs"
                      >
                        {dict.form.role.options.member}
                      </SelectItem>
                      <SelectItem
                        value="admin"
                        className="rounded-none text-xs"
                      >
                        {dict.form.role.options.admin}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
                className="rounded-none h-9 text-xs flex-1 sm:flex-none"
              >
                {dict.form.cancel}
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="rounded-none h-9 text-xs flex-1 sm:flex-none"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {dict.form.submit}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
