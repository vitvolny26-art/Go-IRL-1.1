/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const placement = readFileSync(new URL("./createPriceFieldPlacement.ts", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("Activities create/edit price field placement contract", () => {
  it("loads the runtime placement enhancer", () => {
    expect(html).toContain('<script type="module" src="/src/createPriceFieldPlacement.ts"></script>');
  });

  it("surfaces price directly after the date/time row", () => {
    expect(placement).toContain('input[name="price"]');
    expect(placement).toContain('input[name="date"]');
    expect(placement).toContain('dateRow.insertAdjacentElement("afterend", row)');
    expect(placement).toContain('row.className = "form-row activ011-price-row"');
  });

  it("prefills edits and preserves the existing price form contract", () => {
    expect(placement).toContain("proxy.value = original.value");
    expect(placement).toContain('original.dispatchEvent(new Event("input", { bubbles: true }))');
    expect(placement).toContain('original.dispatchEvent(new Event("change", { bubbles: true }))');
    expect(placement).toContain('form.addEventListener("submit", sync, { capture: true })');
    expect(placement).toContain("originalLabel.hidden = true");
  });
});
