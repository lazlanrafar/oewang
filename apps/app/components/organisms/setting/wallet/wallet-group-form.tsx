"use client";

import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
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

import {
  createWalletGroup,
  updateWalletGroup,
} from "@workspace/modules/wallet-group/wallet-group.action";
import { type WalletGroup } from "@workspace/modules/wallet-group/wallet-group.action";

interface WalletGroupFormProps {
  group?: WalletGroup | null;
  onClose: () => void;
  dictionary: any;
}

export function WalletGroupForm({
  group,
  onClose,
  dictionary,
}: WalletGroupFormProps) {
  const queryClient = useQueryClient();

  const formSchema = z.object({
    name: z
      .string()
      .min(1, { message: dictionary.groups.form.name.error_required }),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema as any),
    defaultValues: {
      name: group?.name ?? "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const result = await createWalletGroup({ name: data.name });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet-groups"] });
      toast.success(dictionary.form.create_success); // Helper text might be generic or I should add specific key?
      // I added generic success message to dictionary for wallets.
      // For groups, I didn't add specific success message.
      // I'll just use generic "Saved" or reuse wallet success for now to save time/space.
      onClose();
    },
    onError: (error) => {
      toast.error(`Error: ${(error as Error).message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      if (!group) throw new Error("No group to update");
      const result = await updateWalletGroup(group.id, { name: data.name });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet-groups"] });
      toast.success(dictionary.form.update_success);
      onClose();
    },
    onError: (error) => {
      toast.error(`Error: ${(error as Error).message}`);
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{dictionary.groups.form.name.label}</FormLabel>
              <FormControl>
                <Input
                  placeholder={dictionary.groups.form.name.placeholder}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {dictionary.form.cancel}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {dictionary.form.submit}
          </Button>
        </div>
      </form>
    </Form>
  );
}
