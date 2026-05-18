import { describe, test, expect } from "bun:test";
import {
  bytesToMB,
  mbToBytes,
  isFileTooLarge,
  isStorageQuotaExceeded,
  calculateRemainingStorage,
  calculateStorageUsagePercentage,
  computeSha256,
  validateFileName,
  getFileExtension,
  isFileTypeAllowed,
  formatFileSize,
  getStorageStatus,
} from "./vault.utils";

describe("vault.utils", () => {
  describe("bytesToMB", () => {
    test("converts bytes to megabytes", () => {
      expect(bytesToMB(1048576)).toBe(1); // 1 MB
      expect(bytesToMB(5242880)).toBe(5); // 5 MB
    });

    test("handles decimal results", () => {
      expect(bytesToMB(1572864)).toBe(1.5); // 1.5 MB
      expect(bytesToMB(524288)).toBeCloseTo(0.5); // 0.5 MB
    });

    test("handles zero", () => {
      expect(bytesToMB(0)).toBe(0);
    });
  });

  describe("mbToBytes", () => {
    test("converts megabytes to bytes", () => {
      expect(mbToBytes(1)).toBe(1048576);
      expect(mbToBytes(5)).toBe(5242880);
    });

    test("handles decimal MB", () => {
      expect(mbToBytes(1.5)).toBe(1572864);
      expect(mbToBytes(0.5)).toBe(524288);
    });

    test("handles zero", () => {
      expect(mbToBytes(0)).toBe(0);
    });
  });

  describe("isFileTooLarge", () => {
    test("returns true when file exceeds limit", () => {
      expect(isFileTooLarge(mbToBytes(6), 5)).toBe(true);
      expect(isFileTooLarge(mbToBytes(10.1), 10)).toBe(true);
    });

    test("returns false when file is within limit", () => {
      expect(isFileTooLarge(mbToBytes(4), 5)).toBe(false);
      expect(isFileTooLarge(mbToBytes(5), 5)).toBe(false);
    });

    test("returns false for exact limit", () => {
      expect(isFileTooLarge(mbToBytes(5), 5)).toBe(false);
    });
  });

  describe("isStorageQuotaExceeded", () => {
    test("returns true when quota would be exceeded", () => {
      const currentUsage = mbToBytes(80);
      const newFile = mbToBytes(30);
      const quota = 100;

      expect(isStorageQuotaExceeded(currentUsage, newFile, quota)).toBe(true);
    });

    test("returns false when quota not exceeded", () => {
      const currentUsage = mbToBytes(80);
      const newFile = mbToBytes(10);
      const quota = 100;

      expect(isStorageQuotaExceeded(currentUsage, newFile, quota)).toBe(false);
    });

    test("returns false for exact quota", () => {
      const currentUsage = mbToBytes(80);
      const newFile = mbToBytes(20);
      const quota = 100;

      expect(isStorageQuotaExceeded(currentUsage, newFile, quota)).toBe(false);
    });
  });

  describe("calculateRemainingStorage", () => {
    test("calculates remaining space", () => {
      const used = mbToBytes(30);
      const quota = 100;

      expect(calculateRemainingStorage(used, quota)).toBe(mbToBytes(70));
    });

    test("returns 0 when quota exceeded", () => {
      const used = mbToBytes(110);
      const quota = 100;

      expect(calculateRemainingStorage(used, quota)).toBe(0);
    });

    test("returns full quota when nothing used", () => {
      expect(calculateRemainingStorage(0, 100)).toBe(mbToBytes(100));
    });
  });

  describe("calculateStorageUsagePercentage", () => {
    test("calculates usage percentage", () => {
      expect(calculateStorageUsagePercentage(mbToBytes(50), 100)).toBe(50);
      expect(calculateStorageUsagePercentage(mbToBytes(25), 100)).toBe(25);
    });

    test("returns 100 for quota 0", () => {
      expect(calculateStorageUsagePercentage(mbToBytes(50), 0)).toBe(100);
    });

    test("caps at 100 when over quota", () => {
      expect(calculateStorageUsagePercentage(mbToBytes(150), 100)).toBe(100);
    });

    test("rounds to 2 decimal places", () => {
      expect(calculateStorageUsagePercentage(mbToBytes(33.333), 100)).toBe(33.33);
    });
  });

  describe("computeSha256", () => {
    test("computes SHA-256 hash", () => {
      const buffer = Buffer.from("hello world");
      const hash = computeSha256(buffer);

      expect(hash).toBe(
        "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
      );
    });

    test("returns different hashes for different content", () => {
      const buffer1 = Buffer.from("hello");
      const buffer2 = Buffer.from("world");

      expect(computeSha256(buffer1)).not.toBe(computeSha256(buffer2));
    });

    test("returns same hash for same content", () => {
      const buffer1 = Buffer.from("test");
      const buffer2 = Buffer.from("test");

      expect(computeSha256(buffer1)).toBe(computeSha256(buffer2));
    });
  });

  describe("validateFileName", () => {
    test("validates correct file names", () => {
      expect(validateFileName("document.pdf").valid).toBe(true);
      expect(validateFileName("image-2024.jpg").valid).toBe(true);
      expect(validateFileName("file_name.txt").valid).toBe(true);
    });

    test("rejects empty name", () => {
      const result = validateFileName("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    test("rejects too long name", () => {
      const longName = "a".repeat(256);
      const result = validateFileName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("255 characters");
    });

    test("rejects illegal characters", () => {
      expect(validateFileName("file<name>.txt").valid).toBe(false);
      expect(validateFileName("file>name.txt").valid).toBe(false);
      expect(validateFileName('file"name.txt').valid).toBe(false);
      expect(validateFileName("file|name.txt").valid).toBe(false);
    });

    test("accepts maximum length", () => {
      const maxName = "a".repeat(255);
      expect(validateFileName(maxName).valid).toBe(true);
    });
  });

  describe("getFileExtension", () => {
    test("extracts file extension", () => {
      expect(getFileExtension("document.pdf")).toBe("pdf");
      expect(getFileExtension("image.jpg")).toBe("jpg");
      expect(getFileExtension("archive.tar.gz")).toBe("gz");
    });

    test("returns empty string for no extension", () => {
      expect(getFileExtension("README")).toBe("");
      expect(getFileExtension("Makefile")).toBe("");
    });

    test("converts to lowercase", () => {
      expect(getFileExtension("FILE.PDF")).toBe("pdf");
      expect(getFileExtension("Image.JPG")).toBe("jpg");
    });

    test("handles hidden files", () => {
      expect(getFileExtension(".gitignore")).toBe("gitignore");
    });
  });

  describe("isFileTypeAllowed", () => {
    test("allows exact mime type match", () => {
      const allowed = ["image/png", "image/jpeg", "application/pdf"];
      expect(isFileTypeAllowed("image/png", allowed)).toBe(true);
      expect(isFileTypeAllowed("application/pdf", allowed)).toBe(true);
    });

    test("rejects non-allowed mime types", () => {
      const allowed = ["image/png", "image/jpeg"];
      expect(isFileTypeAllowed("application/pdf", allowed)).toBe(false);
      expect(isFileTypeAllowed("video/mp4", allowed)).toBe(false);
    });

    test("supports wildcards", () => {
      const allowed = ["image/*", "application/pdf"];
      expect(isFileTypeAllowed("image/png", allowed)).toBe(true);
      expect(isFileTypeAllowed("image/jpeg", allowed)).toBe(true);
      expect(isFileTypeAllowed("image/webp", allowed)).toBe(true);
      expect(isFileTypeAllowed("video/mp4", allowed)).toBe(false);
    });

    test("handles empty allowed list", () => {
      expect(isFileTypeAllowed("image/png", [])).toBe(false);
    });
  });

  describe("formatFileSize", () => {
    test("formats bytes", () => {
      expect(formatFileSize(0)).toBe("0 B");
      expect(formatFileSize(100)).toBe("100.00 B");
      expect(formatFileSize(1023)).toBe("1023.00 B");
    });

    test("formats kilobytes", () => {
      expect(formatFileSize(1024)).toBe("1.00 KB");
      expect(formatFileSize(1536)).toBe("1.50 KB");
    });

    test("formats megabytes", () => {
      expect(formatFileSize(1048576)).toBe("1.00 MB");
      expect(formatFileSize(1572864)).toBe("1.50 MB");
    });

    test("formats gigabytes", () => {
      expect(formatFileSize(1073741824)).toBe("1.00 GB");
    });

    test("formats terabytes", () => {
      expect(formatFileSize(1099511627776)).toBe("1.00 TB");
    });
  });

  describe("getStorageStatus", () => {
    test('returns "low" for low usage', () => {
      expect(getStorageStatus(0)).toBe("low");
      expect(getStorageStatus(50)).toBe("low");
      expect(getStorageStatus(69)).toBe("low");
    });

    test('returns "medium" for medium usage', () => {
      expect(getStorageStatus(70)).toBe("medium");
      expect(getStorageStatus(80)).toBe("medium");
      expect(getStorageStatus(89)).toBe("medium");
    });

    test('returns "high" for high usage', () => {
      expect(getStorageStatus(90)).toBe("high");
      expect(getStorageStatus(95)).toBe("high");
      expect(getStorageStatus(99)).toBe("high");
    });

    test('returns "full" for full or over quota', () => {
      expect(getStorageStatus(100)).toBe("full");
      expect(getStorageStatus(105)).toBe("full");
    });
  });
});
