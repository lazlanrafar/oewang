import { describe, expect, it } from "bun:test";
import { slugify } from "./articles.utils";

describe("slugify", () => {
  it("should lowercase and dash-separate when given spaced words", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("should collapse punctuation runs to a single dash", () => {
    expect(slugify("Hello,  World!!")).toBe("hello-world");
  });

  it("should trim leading and trailing dashes", () => {
    expect(slugify("  ...Money 101...  ")).toBe("money-101");
  });

  it("should fall back to 'article' when no alphanumerics remain", () => {
    expect(slugify("—!!—")).toBe("article");
  });
});
