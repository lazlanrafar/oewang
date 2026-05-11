"use client";

import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import {
  createWalletGroup,
  updateWalletGroup,
  type WalletGroup,
} from "@workspace/modules/wallet-group/wallet-group.action";
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
} from "@workspace/ui";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

interface WalletGroupFormProps {
  open: boolean;
  group?: WalletGroup | null;
  onClose: () => void;
  dictionary: Dictionary;
}

export function WalletGroupForm({ open, group, onClose, dictionary }: WalletGroupFormProps) {
  const queryClient = useQueryClient();

  const wallets_t = dictionary.wallets ?? dictionary.settings.wallets;
  const groups_t = wallets_t.groups;
  const common = dictionary.common;

  const formSchema = z.object({
    name: z.string().min(1, { message: groups_t?.form?.name?.error_required || "Name is required" }),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: group?.name ?? "",
    },
  });

  React.useEffect(() => {
    if (group) {
      form.reset({ name: group.name });
    } else {
      form.reset({ name: "" });
    }
  }, [group, form]);

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const result = await createWalletGroup({ name: data.name });
      if (!result.success) throw new Error(result.error || "Failed to create group");
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet-groups"] });
      toast.success((wallets_t?.form?.create_success ?? common?.save) || "Group created");
      onClose();
    },
    onError: (error) => {
      toast.error(`${common?.error || "Error"}: ${(error as Error).message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      if (!group) throw new Error("No group to update");
      const result = await updateWalletGroup(group.id, { name: data.name });
      if (!result.success) throw new Error(result.error || "Failed to update group");
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet-groups"] });
      toast.success((wallets_t?.form?.update_success ?? common?.save) || "Group updated");
      onClose();
    },
    onError: (error) => {
      toast.error(`${common?.error || "Error"}: ${(error as Error).message}`);
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (group) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (!groups_t) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-none sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{group ? groups_t.edit : groups_t.add}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{groups_t.form.name.label}</FormLabel>
                  <FormControl>
                    <Input placeholder={groups_t.form.name.placeholder} {...field} className="rounded-none" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
                className="h-8 rounded-none text-xs"
              >
                {common?.cancel || "Cancel"}
              </Button>
              <Button type="submit" disabled={isSubmitting} className="h-8 rounded-none text-xs">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {common?.save || "Save"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
