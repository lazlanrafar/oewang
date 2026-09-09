"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui";
import { Cpu, Zap, Database, ArrowUpRight } from "lucide-react";

export function AiUsageClient() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl tracking-tight">AI Usage & Metrics</h1>
        <p className="text-muted-foreground text-sm">
          Track Python FastAPI sidecar AI usage, token consumption, OCR scans, and RAG embeddings.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-sm">Total AI Token Requests</CardTitle>
            <Cpu className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">128,450</div>
            <p className="text-emerald-500 text-xs flex items-center gap-1 mt-1">
              <ArrowUpRight className="size-3" /> +12.4% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-sm">OCR Receipt Scans</CardTitle>
            <Zap className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">1,420</div>
            <p className="text-muted-foreground text-xs mt-1">Processed in Vault</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-sm">pgvector RAG Embeddings</CardTitle>
            <Database className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">3,890</div>
            <p className="text-muted-foreground text-xs mt-1">Indexed vectors</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
