"use client";

import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import type { User } from "@workspace/types";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Separator,
  Skeleton,
} from "@workspace/ui";

function SettingProfileSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Skeleton className="h-6 w-48 rounded-none" />
        <Skeleton className="h-4 w-72 rounded-none" />
      </div>
      <Separator className="rounded-none" />
      <div className="flex items-center gap-6">
        <Skeleton className="h-20 w-20 rounded-none" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-24 rounded-none" />
          <Skeleton className="h-8 w-32 rounded-none" />
          <Skeleton className="h-3 w-40 rounded-none" />
        </div>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20 rounded-none" />
          <Skeleton className="h-10 w-full max-w-md rounded-none" />
          <Skeleton className="h-4 w-64 rounded-none" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20 rounded-none" />
          <Skeleton className="h-10 w-full max-w-md rounded-none" />
          <Skeleton className="h-4 w-64 rounded-none" />
        </div>
      </div>
      <Skeleton className="h-8 w-28 rounded-none" />
    </div>
  );
}

import { getMe, updateAvatarAction, updateProfileAction } from "@workspace/modules/user/user.action";
import { Loader2, Upload } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

interface SettingProfileFormProps {
  dictionary: Dictionary;
}

export function SettingProfileForm({ dictionary }: SettingProfileFormProps) {
  const { data: meData, isLoading: isMeLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const result = await getMe();
      if (result.success) return result.data;
      throw new Error(result.error);
    },
  });

  const profile =
    (dictionary as Dictionary & { profile?: Dictionary["settings"]["profile"] }).profile ?? dictionary.settings.profile;

  if (isMeLoading || !dictionary || !meData?.user || !profile) {
    return <SettingProfileSkeleton />;
  }

  return <ProfileFormInner dictionary={dictionary} profile={profile} user={meData.user} />;
}

function ProfileFormInner({
  dictionary,
  profile,
  user,
}: {
  dictionary: Dictionary;
  profile: Dictionary["settings"]["profile"];
  user: Pick<User, "name" | "email" | "profile_picture"> & {
    mobile?: string | null;
  };
}) {
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = React.useState(false);

  const profileFormSchema = z.object({
    username: z
      .string()
      .min(2, {
        message: profile.username.error_min || "Too short",
      })
      .max(30, {
        message: profile.username.error_max || "Too long",
      }),
    email: z
      .string({
        required_error: profile.email.error_required || "Required",
      })
      .email(),
    profile_picture: z.string().optional(),
    mobile: z.string().optional().nullable(),
  });

  type ProfileFormValues = z.infer<typeof profileFormSchema>;

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      username: user?.name || "",
      email: user?.email || "",
      profile_picture: user?.profile_picture || "",
      mobile: user?.mobile || "",
    },
    mode: "onChange",
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      const result = await updateProfileAction({
        name: data.username,
        profile_picture: data.profile_picture,
        mobile: data.mobile || undefined,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success(profile.toast_success || "Profile updated");
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error) => {
      toast.error(`${dictionary.common.error || "Error"}: ${(error as Error).message}`);
    },
  });

  function onSubmit(data: ProfileFormValues) {
    updateMutation.mutate(data);
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error(profile.avatar.error_size || "File too large");
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await updateAvatarAction(formData);

      if (response.success && response.data.url) {
        const newUrl = response.data.url;
        form.setValue("profile_picture", newUrl);
        toast.success(profile.avatar.toast_success || "Avatar updated");
        queryClient.invalidateQueries({ queryKey: ["me"] });
      } else {
        toast.error(response.error || profile.avatar.error_upload || "Upload failed");
      }
    } catch (_error) {
      toast.error(profile.avatar.error_upload || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="font-medium text-lg tracking-tight">{profile.title}</h2>
        <p className="text-muted-foreground text-xs">{profile.description}</p>
      </div>
      <Separator className="rounded-none" />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20 rounded-none">
              <AvatarImage src={form.getValues("profile_picture")} />
              <AvatarFallback className="rounded-none text-xl">
                {form.getValues("username").charAt(0).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <FormLabel>{profile.avatar.label}</FormLabel>
              <div className="flex items-center gap-3">
                <Input type="file" accept="image/*" className="hidden" id="avatar-upload" onChange={handleFileUpload} />
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-none text-xs"
                  disabled={isUploading}
                  onClick={() => (document.getElementById("avatar-upload") as HTMLInputElement)?.click()}
                >
                  {isUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {profile.avatar.upload_new}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{profile.avatar.allowed_formats}</p>
            </div>
          </div>

          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{profile.form.username_label}</FormLabel>
                <FormControl>
                  <Input placeholder={profile.form.username_placeholder} {...field} className="max-w-md rounded-none" />
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
                  <Input disabled {...field} className="max-w-md rounded-none" />
                </FormControl>
                <FormDescription>{profile.email.description}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="mobile"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{profile.form.mobile_label}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={profile.form.mobile_placeholder}
                    {...field}
                    value={field.value || ""}
                    className="max-w-md rounded-none"
                  />
                </FormControl>
                <FormDescription>{profile.form.mobile_description}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={updateMutation.isPending} className="h-8 rounded-none text-xs">
            {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {profile.update_profile}
          </Button>
        </form>
      </Form>
    </div>
  );
}
