"use client";

import { useState } from "react";

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@workspace/ui/atoms";

import type { WebsiteDictionary } from "@/lib/translations";

type FeedbackType = "bug" | "feature_request" | "other";
type SubmitState = "idle" | "submitting" | "success" | "error";

export function FeedbackForm({ dictionary }: { dictionary: WebsiteDictionary }) {
  const dict = dictionary.feedback;
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<SubmitState>("idle");

  const canSubmit = message.trim().length > 0 && email.trim().length > 0 && state !== "submitting";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setState("submitting");
    try {
      const formData = new FormData();
      formData.append("type", type);
      formData.append("message", message);
      formData.append("email", email);
      if (name.trim()) formData.append("name", name.trim());
      if (file) formData.append("file", file);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
      const res = await fetch(`${apiUrl}/public/feedback`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Request failed");

      setState("success");
      setMessage("");
      setName("");
      setFile(null);
    } catch {
      setState("error");
    }
  }

  if (state === "success") {
    return <p className="text-foreground text-sm">{dict.success}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="feedback-type">{dict.typeLabel}</Label>
        <Select value={type} onValueChange={(v) => setType(v as FeedbackType)}>
          <SelectTrigger id="feedback-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bug">{dict.typeBug}</SelectItem>
            <SelectItem value="feature_request">{dict.typeFeatureRequest}</SelectItem>
            <SelectItem value="other">{dict.typeOther}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback-message">{dict.messageLabel}</Label>
        <Textarea
          id="feedback-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={dict.messagePlaceholder}
          rows={5}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback-email">{dict.emailLabel}</Label>
        <Input
          id="feedback-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={dict.emailPlaceholder}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback-name">{dict.nameLabel}</Label>
        <Input id="feedback-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback-screenshot">{dict.screenshotLabel}</Label>
        <input
          id="feedback-screenshot"
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-muted-foreground text-sm file:mr-4 file:border-0 file:bg-muted file:px-4 file:py-2 file:text-foreground file:text-sm"
        />
      </div>

      {state === "error" && <p className="text-destructive text-sm">{dict.error}</p>}

      <Button type="submit" disabled={!canSubmit} className="w-full">
        {state === "submitting" ? dict.submitting : dict.submit}
      </Button>
    </form>
  );
}
