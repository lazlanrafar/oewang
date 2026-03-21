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

  const { groups } = dictionary.wallets;

  const formSchema = z.object({
    name: z
      .string()
      .min(1, { message: groups.form.name.error_required }),
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
      toast.success(dictionary.settings?.wallets?.form?.create_success ?? dictionary.common.save); // Using fallback because group success is not in dict yet
      onClose();
    },
    onError: (error) => {
      toast.error(`${dictionary.common.error}: ${(error as Error).message}`);
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
      toast.success(dictionary.settings?.wallets?.form?.update_success ?? dictionary.common.save);
      onClose();
    },
    onError: (error) => {
      toast.error(`${dictionary.common.error}: ${(error as Error).message}`);
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
              <FormLabel>{groups.form.name.label}</FormLabel>
              <FormControl>
                <Input
                  placeholder={groups.form.name.placeholder}
                  {...field}
                  className="rounded-none"
                />
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
            className="rounded-none h-8 text-xs"
          >
            {dictionary.common.cancel}
          </Button>
          <Button type="submit" disabled={isSubmitting} className="rounded-none h-8 text-xs">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {dictionary.common.save}
          </Button>
        </div>
      </form>
    </Form>
  );
}
