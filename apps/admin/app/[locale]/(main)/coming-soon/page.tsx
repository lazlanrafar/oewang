"use client";

import React from "react";

import { Button, Input } from "@workspace/ui";
import { ArrowRight, HardHat, Mail } from "lucide-react";
import { toast } from "sonner";

export default function ComingSoonPage() {
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
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-140px)] w-full p-4 text-center">
      <div className="max-w-md w-full space-y-6">
        {/* Simple Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
          <HardHat className="h-8 w-8 text-primary" />
        </div>

        {/* Content */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Coming Soon</h1>
          <p className="text-muted-foreground text-sm">
            We're currently working hard on this feature. <br />
            Sign up below to get notified when it's ready.
          </p>
        </div>

        {/* Simplified Form */}
        <form onSubmit={handleNotify} className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="pl-10 h-10 bg-background/50 focus-visible:ring-primary"
            />
          </div>
          <Button type="submit" className="w-full h-10 group font-medium">
            Notify Me
            <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </form>

        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Stay tuned for updates</p>
      </div>
    </div>
  );
}
