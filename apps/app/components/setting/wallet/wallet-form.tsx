"use client";

import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Switch,
} from "@workspace/ui";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import {
  type CreateWalletData,
  createWallet,
  type UpdateWalletData,
  updateWallet,
  type Wallet,
} from "@workspace/modules";
import { getWalletGroups } from "@workspace/modules";

interface WalletFormProps {
  wallet?: Wallet | null;
  onClose: () => void;
  dictionary: any;
}

export function WalletForm({ wallet, onClose, dictionary }: WalletFormProps) {
  const queryClient = useQueryClient();

  const formSchema = z.object({
    name: z.string().min(1, { message: dictionary.form.name.error_required }),
    groupId: z.string().optional().nullable(),
    balance: z.string().optional(),
    isIncludedInTotals: z.boolean().default(true),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: wallet?.name ?? "",
      groupId: wallet?.groupId ?? "none",
      balance: wallet?.balance?.toString() ?? "0",
      isIncludedInTotals: wallet?.isIncludedInTotals ?? true,
    },
  });

  // Fetch groups for selection
  const { data: groups } = useQuery({
    queryKey: ["wallet-groups"],
    queryFn: async () => {
      const result = await getWalletGroups();
      if (result.success) return result.data;
      throw new Error(result.error);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const payload: CreateWalletData = {
        name: data.name,
        balance: data.balance,
        isIncludedInTotals: data.isIncludedInTotals,
        groupId: data.groupId === "none" ? null : data.groupId,
      };
      const result = await createWallet(payload);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      toast.success(dictionary.form.create_success);
      onClose();
    },
    onError: (error) => {
      toast.error(`Error: ${(error as Error).message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      if (!wallet) throw new Error("No wallet to update");
      const payload: UpdateWalletData = {
        name: data.name,
        balance: data.balance,
        isIncludedInTotals: data.isIncludedInTotals,
        groupId: data.groupId === "none" ? null : data.groupId,
      };
      const result = await updateWallet(wallet.id, payload);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      toast.success(dictionary.form.update_success);
      onClose();
    },
    onError: (error) => {
      toast.error(`Error: ${(error as Error).message}`);
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (wallet) {
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
              <FormLabel>{dictionary.form.name.label}</FormLabel>
              <FormControl>
                <Input placeholder={dictionary.form.name.placeholder} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Group */}
        <FormField
          control={form.control}
          name="groupId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{dictionary.form.group.label}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value ?? "none"}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={dictionary.form.group.placeholder} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">{dictionary.form.group.none}</SelectItem>
                  {groups?.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Balance */}
        <FormField
          control={form.control}
          name="balance"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{dictionary.form.balance.label}</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder={dictionary.form.balance.placeholder} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Include in Totals */}
        <FormField
          control={form.control}
          name="isIncludedInTotals"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <FormLabel>{dictionary.form.is_included.label}</FormLabel>
                <p className="text-[0.8rem] text-muted-foreground">{dictionary.form.is_included.description}</p>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
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
