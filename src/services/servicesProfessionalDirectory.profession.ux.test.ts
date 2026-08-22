import { describe, expect, it } from "vitest";
import source from "./servicesProfessionalDirectory.ts?raw";

describe("public beauty directory profession contract", () => {
  it("is ready for an additive service_specialization field without repurposing profile specialization text", () => {
    expect(source).toContain("service_specialization?: string | null");
    expect(source).toContain("profession: normalizeProfession(row.service_specialization)");
    expect(source).not.toContain("profession: normalizeProfession(row.specialization)");
  });
});
