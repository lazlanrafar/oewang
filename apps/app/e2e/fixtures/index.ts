import { test as base } from "@playwright/test";

import en from "../../../../packages/dictionaries/en.json";

// Define the custom fixture types
type MyFixtures = {
  dictionary: typeof en;
};

// Extend the base test with the dictionary fixture
export const test = base.extend<MyFixtures>({
  dictionary: async (_args, use) => {
    // We use the English dictionary by default for E2E tests
    await use(en);
  },
});

export { expect } from "@playwright/test";
export const setup = test;
