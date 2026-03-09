"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
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
  CurrencyInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  ScrollArea,
} from "@workspace/ui";
import { useRouter } from "next/navigation";
import {
  createWallet,
  updateWallet,
  type Wallet,
} from "@workspace/modules/wallet/wallet.action";
import {
  getWalletGroups,
  type WalletGroup,
} from "@workspace/modules/wallet-group/wallet-group.action";
import { useCurrency } from "@workspace/ui/hooks";

const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  groupId: z.string().optional().nullable(),
  balance: z.coerce.number().default(0),
  isIncludedInTotals: z.boolean().default(true),
});

type AccountFormValues = z.infer<typeof accountSchema>;

interface AccountSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet?: Wallet;
}

export function AccountFormSheet({
  open,
  onOpenChange,
  wallet,
}: AccountSheetProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [groups, setGroups] = useState<WalletGroup[]>([]);
  const { settings } = useCurrency();

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema as any),
    defaultValues: {
      name: "",
      groupId: null,
      balance: 0,
      isIncludedInTotals: true,
    },
  });

  // Reset form when wallet changes or sheet opens
  useEffect(() => {
    if (open) {
      form.reset({
        name: wallet?.name ?? "",
        groupId: wallet?.groupId ?? null,
        balance: wallet?.balance ?? 0,
        isIncludedInTotals: wallet?.isIncludedInTotals ?? true,
      });
    }
  }, [open, wallet, form]);

  useEffect(() => {
    const loadGroups = async () => {
      try {
        const response = await getWalletGroups();
        if (response.success && response.data) {
          setGroups(response.data);
        }
      } catch (error) {
        console.error("Failed to load wallet groups", error);
      }
    };
    loadGroups();
  }, []);

  async function onSubmit(data: AccountFormValues) {
    setIsLoading(true);
    try {
      const payload = {
        ...data,
        balance: data.balance.toString(),
        groupId: data.groupId === "none" ? null : data.groupId,
      };

      if (wallet?.id) {
        await updateWallet(wallet.id, payload);
        toast.success("Account updated successfully");
      } else {
        await createWallet(payload);
        toast.success("Account created successfully");
      }

      router.refresh();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save account");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader className="mb-0">
          <SheetTitle>{wallet ? "Edit Account" : "Add Account"}</SheetTitle>
          <SheetDescription>
            {wallet
              ? "Update your account details below."
              : "Create a new financial account to track your balance."}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col h-full"
          >
            <ScrollArea className="h-full p-0">
              <div className="space-y-6 py-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Personal Savings, Business..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="groupId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Group</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || "none"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a group" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No Group</SelectItem>
                          {groups.map((group) => (
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

                <FormField
                  control={form.control}
                  name="balance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Initial Balance</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                            {settings?.mainCurrencySymbol ?? "$"}
                          </span>
                          <CurrencyInput
                            value={field.value}
                            onChange={field.onChange}
                            currencySymbol={settings?.mainCurrencySymbol}
                            decimalPlaces={settings?.mainCurrencyDecimalPlaces}
                            className="pl-8 text-lg font-bold"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isIncludedInTotals"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="mb-2">
                          Include in Totals
                        </FormLabel>
                        <div className="text-sm text-muted-foreground">
                          Show this account's balance in net worth calculations.
                        </div>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </ScrollArea>

            <div className="mt-8">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading
                  ? "Saving..."
                  : wallet
                    ? "Update Account"
                    : "Create Account"}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
