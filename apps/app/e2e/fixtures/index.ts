import { test as base } from "@playwright/test";

import en from "../../../../packages/dictionaries/en.json";

// Define the custom fixture types
type MyFixtures = {
  dictionary: typeof en;
};

// Extend the base test with the dictionary fixture and page helper
export const test = base.extend<MyFixtures>({
  dictionary: async (_: object, use) => {
    // We use the English dictionary by default for E2E tests
    await use(en);
  },
  page: async ({ page }, use) => {
    // Inject a style to hide nextjs-portal (dev overlay) and other potential blockages
    await page.addInitScript(() => {
      const injectStyle = () => {
        const style = document.createElement("style");
        style.innerHTML = `
          nextjs-portal, 
          [data-nextjs-dev-overlay],
          #__next-route-announcer__ {
            display: none !important;
            pointer-events: none !important;
            opacity: 0 !important;
            width: 0 !important;
            height: 0 !important;
            visibility: hidden !important;
          }
        `;
        document.head.appendChild(style);
      };
      if (document.head) {
        injectStyle();
      } else {
        window.addEventListener("DOMContentLoaded", injectStyle);
      }
    });
    await use(page);
  },
});

export { expect } from "@playwright/test";
export const setup = test;
