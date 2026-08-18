import { describe, expect, it } from "vitest";
import { resolvePublicSeo } from "./publicSeo";

describe("public Master SEO", () => {
  it("publishes the canonical masters catalog metadata", () => {
    expect(resolvePublicSeo("/masters/")).toEqual({
      title: "Мастера GO IRL — услуги и запись в Оломоуце",
      description: "Найдите мастера в GO IRL, посмотрите услуги, цены и свободное время для записи в Оломоуце.",
      canonicalUrl: "https://go-irl.fun/masters",
      language: "ru",
    });
  });

  it("canonicalizes localized Master profiles to the stable slug route", () => {
    expect(resolvePublicSeo("/master/beauty-test-studio/en")).toMatchObject({
      canonicalUrl: "https://go-irl.fun/master/beauty-test-studio",
      language: "en",
    });
  });

  it("does not overwrite unrelated routes", () => {
    expect(resolvePublicSeo("/services")).toBeNull();
    expect(resolvePublicSeo("/beauty/beauty-test-studio")).toBeNull();
  });
});
