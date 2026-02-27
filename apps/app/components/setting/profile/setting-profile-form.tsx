"use client";

import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Button,
  cn,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
} from "@workspace/ui";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { getMe, updateProfileAction } from "@workspace/modules";

interface SettingProfileFormProps {
  dictionary: {
    settings: {
      profile: {
        title: string;
        description: string;
        username: {
          label: string;
          placeholder: string;
          description: string;
          error_min: string;
          error_max: string;
        };
        email: {
          label: string;
          placeholder: string;
          description: string;
          error_required: string;
        };
        bio: {
          label: string;
          placeholder: string;
          description: string;
        };
        update_profile: string;
        toast_submitted: string;
      };
    };
  };
}

export function SettingProfileForm({ dictionary }: SettingProfileFormProps) {
  const { profile } = dictionary.settings;

  // 1. Fetch real user data
  const { data: meData, isLoading: isMeLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const result = await getMe();
      if (result.success) return result.data;
      throw new Error(result.error);
    },
  });

  const profileFormSchema = z.object({
    username: z
      .string()
      .min(2, {
        message: profile.username.error_min,
      })
      .max(30, {
        message: profile.username.error_max,
      }),
    email: z
      .string({
        required_error: profile.email.error_required,
      })
      .email(),
    bio: z.string().max(160).optional(),
  });

  type ProfileFormValues = z.infer<typeof profileFormSchema>;

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      username: "",
      email: "",
      bio: "",
    },
    mode: "onChange",
  });

  // 2. Sync form values when data is loaded
  React.useEffect(() => {
    if (meData?.user) {
      form.reset({
        username: meData.user.name || "",
        email: meData.user.email,
        bio: "",
      });
    }
  }, [meData, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      const result = await updateProfileAction({
        name: data.username,
        bio: data.bio,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Profile updated successfully");
    },
    onError: (error) => {
      toast.error(`Error: ${(error as Error).message}`);
    },
  });

  function onSubmit(data: ProfileFormValues) {
    updateMutation.mutate(data);
  }

  if (isMeLoading) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{profile.username.label}</FormLabel>
              <FormControl>
                <Input placeholder={profile.username.placeholder} {...field} />
              </FormControl>
              <FormDescription>{profile.username.description}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{profile.email.label}</FormLabel>
              <FormControl>
                <Input disabled {...field} />
              </FormControl>
              <FormDescription>{profile.email.description}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{profile.bio.label}</FormLabel>
              <FormControl>
                <Textarea placeholder={profile.bio.placeholder} className="resize-none" {...field} />
              </FormControl>
              <FormDescription>{profile.bio.description}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {profile.update_profile}
        </Button>
      </form>
    </Form>
  );
}
