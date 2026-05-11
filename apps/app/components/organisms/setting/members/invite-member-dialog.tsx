"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Dictionary } from "@workspace/dictionaries";
import { inviteMember } from "@workspace/modules/workspace/workspace.action";
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

const inviteSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  role: z.enum(["admin", "editor", "viewer"]),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

interface InviteMemberDialogProps {
  onSuccess?: () => void;
  dictionary: Dictionary;
}

export function InviteMemberDialog({ onSuccess, dictionary }: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "viewer" },
  });

  if (!dictionary) return null;

  const membersDict = dictionary.settings.members;

  async function onSubmit(values: InviteFormValues) {
    setLoading(true);
    const result = await inviteMember(values.email, values.role);
    setLoading(false);

    if (result.success) {
      toast.success(membersDict.form.success || "Invitation sent!", {
        description:
          membersDict.form.description.replace("{email}", values.email) ||
          `${values.email} will receive an invite shortly.`,
      });
      setOpen(false);
      form.reset();
      onSuccess?.();
    } else {
      toast.error(result.error || "Failed to send invitation");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)} className="h-8 rounded-none text-xs">
        <UserPlus className="mr-2 h-4 w-4" />
        {membersDict.invite_button}
      </Button>

      <DialogContent className="rounded-none sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-medium text-lg">{membersDict.invite_button}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">{membersDict.description}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">{membersDict.form.email.label}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={membersDict.form.email.placeholder}
                      {...field}
                      className="h-10 rounded-none px-3 text-sm"
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
                  <FormLabel className="text-xs">{membersDict.form.role.label}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10 rounded-none px-3 text-sm">
                        <SelectValue placeholder={membersDict.form.role.placeholder} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-none">
                      <SelectItem value="viewer" className="rounded-none text-xs">
                        {membersDict.form.role.options.viewer}
                      </SelectItem>
                      <SelectItem value="editor" className="rounded-none text-xs">
                        {membersDict.form.role.options.editor}
                      </SelectItem>
                      <SelectItem value="admin" className="rounded-none text-xs">
                        {membersDict.form.role.options.admin}
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
                className="h-9 flex-1 rounded-none text-xs sm:flex-none"
              >
                {membersDict.form.cancel}
              </Button>
              <Button type="submit" disabled={loading} className="h-9 flex-1 rounded-none text-xs sm:flex-none">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {membersDict.form.submit}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
