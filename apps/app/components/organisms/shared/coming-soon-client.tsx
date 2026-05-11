"use client";

import React from "react";

import { Button, Input } from "@workspace/ui";
import { ArrowRight, HardHat, Mail } from "lucide-react";
import { toast } from "sonner";

export function ComingSoonClient() {
  const [email, setEmail] = React.useState("");

  const handleNotify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email");
      return;
    }
    // Mock success
    toast.success(`Thanks! We'll notify you at ${email}`);
    setEmail("");
  };

  return (
    <div className="flex min-h-[calc(100vh-140px)] w-full flex-col items-center justify-center p-4 text-center">
      <div className="w-full max-w-md space-y-6">
        {/* Simple Icon */}
        <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <HardHat className="h-8 w-8 text-primary" />
        </div>

        {/* Content */}
        <div className="space-y-2">
          <h1 className="font-bold text-3xl tracking-tight">Coming Soon</h1>
          <p className="text-muted-foreground text-sm">
            We're currently working hard on this feature. <br />
            Sign up below to get notified when it's ready.
          </p>
        </div>

        {/* Simplified Form */}
        <form onSubmit={handleNotify} className="space-y-3">
          <div className="relative">
            <Mail className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="h-10 bg-background/50 pl-10 focus-visible:ring-primary"
            />
          </div>
          <Button type="submit" className="group h-10 w-full font-medium">
            Notify Me
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </form>

        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Stay tuned for updates</p>
      </div>
    </div>
  );
}
