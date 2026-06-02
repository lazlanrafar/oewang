/**
 * Vault Utilities
 * Pure utility functions for file storage management
 */

import { createHash } from "node:crypto";

/**
 * Convert bytes to megabytes
 */
export function bytesToMB(bytes: number): number {
  return bytes / (1024 * 1024);
}

/**
 * Convert megabytes to bytes
 */
export function mbToBytes(mb: number): number {
  return mb * 1024 * 1024;
}

/**
 * Check if file size exceeds limit
 */
export function isFileTooLarge(
  fileSizeBytes: number,
  maxSizeMB: number,
): boolean {
  const maxBytes = mbToBytes(maxSizeMB);
  return fileSizeBytes > maxBytes;
}

/**
 * Check if storage quota exceeded
 */
export function isStorageQuotaExceeded(
  currentUsageBytes: number,
  newFileSizeBytes: number,
  quotaMB: number,
): boolean {
  const quotaBytes = mbToBytes(quotaMB);
  const totalAfterUpload = currentUsageBytes + newFileSizeBytes;
  return totalAfterUpload > quotaBytes;
}

/**
 * Calculate remaining storage space
 */
export function calculateRemainingStorage(
  currentUsageBytes: number,
  quotaMB: number,
): number {
  const quotaBytes = mbToBytes(quotaMB);
  const remaining = quotaBytes - currentUsageBytes;
  return Math.max(0, remaining); // Never negative
}

/**
 * Calculate storage usage percentage
 */
export function calculateStorageUsagePercentage(
  currentUsageBytes: number,
  quotaMB: number,
): number {
  const quotaBytes = mbToBytes(quotaMB);
  if (quotaBytes === 0) return 100;
  const percentage = (currentUsageBytes / quotaBytes) * 100;
  return Math.min(100, Math.round(percentage * 100) / 100); // Max 100%, rounded to 2 decimals
}

/**
 * Compute SHA-256 hash of buffer
 */
export function computeSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Validate file name
 */
export function validateFileName(fileName: string): {
  valid: boolean;
  error?: string;
} {
  if (!fileName || fileName.trim().length === 0) {
    return { valid: false, error: "File name is required" };
  }

  if (fileName.length > 255) {
    return { valid: false, error: "File name must not exceed 255 characters" };
  }

  // Check for illegal characters
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control-char range for file name validation
  const illegalChars = /[<>:"|?*\x00-\x1f]/;
  if (illegalChars.test(fileName)) {
    return { valid: false, error: "File name contains illegal characters" };
  }

  return { valid: true };
}

/**
 * Get file extension from filename
 */
export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1) return "";
  return fileName.substring(lastDot + 1).toLowerCase();
}

/**
 * Check if file type is allowed
 */
export function isFileTypeAllowed(
  mimeType: string,
  allowedTypes: string[],
): boolean {
  return allowedTypes.some((allowed) => {
    // Support wildcards like "image/*"
    if (allowed.endsWith("/*")) {
      const category = allowed.split("/")[0];
      return mimeType.startsWith(`${category}/`);
    }
    return mimeType === allowed;
  });
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / k ** i;

  return `${size.toFixed(2)} ${units[i]}`;
}

/**
 * Get storage status based on usage
 */
export function getStorageStatus(
  usagePercentage: number,
): "low" | "medium" | "high" | "full" {
  if (usagePercentage >= 100) return "full";
  if (usagePercentage >= 90) return "high";
  if (usagePercentage >= 70) return "medium";
  return "low";
}
