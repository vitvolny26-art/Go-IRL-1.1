/* global document, localStorage, URLSearchParams, location, navigator, fetch, URL, history */
(() => {
  const supported = new Set(["cs", "en", "ru", "uk"]);
  const preferencesStorageKey = "go-irl-user-preferences";
  const legacyLanguageStorageKey = "go-irl-language";
  const page = document.body.dataset.legalPage;
  const relatedPage = document.body.dataset.relatedPage;
  const title = document.getElementById("legal-title");
  const meta = document.getElementById("legal-meta");
  const note = document.getElementById("translation-note");
  const content = document.getElementById("legal-content");
  const relatedLink = document.getElementById("related-legal-link");
  const buttons = Array.from(document.querySelectorAll("[data-lang]"));
  if (!page || !relatedPage || !title || !meta || !note || !content || !relatedLink) return;

  const czech = {
    title: title.textContent || "",
    meta: meta.textContent || "",
    note: note.textContent || "",
    body: content.innerHTML,
    footerLabel: relatedLink.textContent || "",
  };
  const cache = new Map([["cs", czech]]);

  const normalizeLanguage = (value) => {
    const code = String(value || "").trim().toLowerCase().split(/[-_]/)[0];
    return supported.has(code) ? code : null;
  };

  const readUnifiedLanguage = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(preferencesStorageKey) || "null");
      return normalizeLanguage(parsed && parsed.language);
    } catch {
      return null;
    }
  };

  const readInitialLanguage = () => {
    const queryLanguage = normalizeLanguage(new URLSearchParams(location.search).get("lang"));
    if (queryLanguage) return queryLanguage;
    const unified = readUnifiedLanguage();
    if (unified) return unified;
    const legacy = normalizeLanguage(localStorage.getItem(legacyLanguageStorageKey));
    if (legacy) return legacy;
    for (const candidate of navigator.languages || [navigator.language]) {
      const normalized = normalizeLanguage(candidate);
      if (normalized) return normalized;
    }
    return "cs";
  };

  const persistLanguage = (language) => {
    localStorage.setItem(legacyLanguageStorageKey, language);
    try {
      const parsed = JSON.parse(localStorage.getItem(preferencesStorageKey) || "null");
      const preferences = parsed && typeof parsed === "object" ? parsed : {};
      localStorage.setItem(preferencesStorageKey, JSON.stringify({ ...preferences, language }));
    } catch {
      localStorage.setItem(preferencesStorageKey, JSON.stringify({ language }));
    }
  };

  const loadCopy = async (language) => {
    if (cache.has(language)) return cache.get(language);
    const response = await fetch(`/legal/${page}.${language}.json`, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`legal_translation_${response.status}`);
    const copy = await response.json();
    cache.set(language, copy);
    return copy;
  };

  const render = async (language, updateUrl = false) => {
    const selected = supported.has(language) ? language : "cs";
    let copy;
    try {
      copy = await loadCopy(selected);
    } catch {
      copy = czech;
    }
    const active = copy === czech ? "cs" : selected;
    document.documentElement.lang = active;
    document.title = `GO IRL — ${copy.title}`;
    title.textContent = copy.title;
    meta.textContent = copy.meta;
    note.textContent = copy.note;
    content.innerHTML = copy.body;
    relatedLink.textContent = copy.footerLabel;
    relatedLink.href = `/${relatedPage}.html?lang=${encodeURIComponent(active)}`;
    buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.lang === active)));
    persistLanguage(active);
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set("lang", active);
      history.replaceState(null, "", url);
    }
  };

  buttons.forEach((button) => button.addEventListener("click", () => {
    void render(button.dataset.lang || "cs", true);
  }));
  void render(readInitialLanguage());
})();
