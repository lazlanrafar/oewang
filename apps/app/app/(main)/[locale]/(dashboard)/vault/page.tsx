import { VaultClient } from "@/components/organisms/vault/vault-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vault",
};

export default function VaultPage() {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <VaultClient />
    </div>
  );
}
