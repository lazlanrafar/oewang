import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { toast } from "sonner";

interface DownloadInvoiceOptions {
  element: HTMLElement;
  filename: string;
  onStart?: () => void;
  onFinish?: () => void;
}

export async function downloadInvoiceAsPdf({
  element,
  filename,
  onStart,
  onFinish,
}: DownloadInvoiceOptions) {
  if (!element) return;

  onStart?.();

  // Temporarily adjust styles for cleaner print
  const originalBoxShadow = element.style.boxShadow;
  const originalBorder = element.style.border;
  
  // Try to find the inner card if it exists, otherwise use the element itself
  const targetElement = element.querySelector('.invoice-card') as HTMLElement || element;
  const targetOriginalBoxShadow = targetElement.style.boxShadow;
  const targetOriginalBorder = targetElement.style.border;

  const isDark = document.documentElement.classList.contains("dark");

  try {
    if (isDark) {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
      // Wait for React/Tailwind to apply light variables
      await new Promise(r => setTimeout(r, 100));
    }

    targetElement.style.boxShadow = "none";
    targetElement.style.border = "none";

    // Wait for any fonts or images to load before capturing
    await new Promise((resolve) => setTimeout(resolve, 100));

    const dataUrl = await toPng(element, {
      quality: 1,
      pixelRatio: 2,
      style: {
        background: "white", 
      },
    });

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: [element.offsetWidth, element.offsetHeight],
    });

    pdf.addImage(
      dataUrl,
      "PNG",
      0,
      0,
      element.offsetWidth,
      element.offsetHeight,
      undefined,
      "FAST"
    );
    pdf.save(`${filename}.pdf`);
    toast.success("Invoice downloaded as PDF");
  } catch (error) {
    console.error("PDF generation failed:", error);
    toast.error("Failed to generate PDF");
  } finally {
    if (isDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    }
    // Restore original styles
    targetElement.style.boxShadow = targetOriginalBoxShadow;
    targetElement.style.border = targetOriginalBorder;
    onFinish?.();
  }
}
