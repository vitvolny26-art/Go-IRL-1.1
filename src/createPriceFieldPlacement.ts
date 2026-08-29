const priceProxyRowSelector = ".activ011-price-row";

const mirrorPriceToOriginal = (proxy: HTMLInputElement, original: HTMLInputElement) => {
  if (original.value === proxy.value) return;
  original.value = proxy.value;
  original.dispatchEvent(new Event("input", { bubbles: true }));
  original.dispatchEvent(new Event("change", { bubbles: true }));
};

const enhanceCreatePriceField = (form: HTMLFormElement) => {
  const original = form.querySelector<HTMLInputElement>('input[name="price"]');
  const originalLabel = original?.closest<HTMLLabelElement>("label");
  const originalRow = originalLabel?.parentElement;
  const dateInput = form.querySelector<HTMLInputElement>('input[name="date"]');
  const dateRow = dateInput?.closest<HTMLElement>(".form-row");
  if (!original || !originalLabel || !originalRow || !dateRow) return;

  const existingProxy = form.querySelector<HTMLInputElement>(`${priceProxyRowSelector} input[data-price-proxy]`);
  if (existingProxy) {
    if (document.activeElement !== existingProxy && existingProxy.value !== original.value) existingProxy.value = original.value;
    return;
  }

  const row = document.createElement("div");
  row.className = "form-row activ011-price-row";
  row.dataset.activ011PricePlacement = "true";

  const label = document.createElement("label");
  label.className = "price-field";
  const caption = document.createElement("span");
  caption.textContent = originalLabel.querySelector("span")?.textContent || "Price";

  const proxy = document.createElement("input");
  proxy.type = "number";
  proxy.dataset.priceProxy = "true";
  proxy.value = original.value;
  proxy.required = original.required;
  if (original.min) proxy.min = original.min;
  if (original.max) proxy.max = original.max;
  if (original.step) proxy.step = original.step;
  proxy.setAttribute("aria-label", caption.textContent || "Price");

  const sync = () => mirrorPriceToOriginal(proxy, original);
  proxy.addEventListener("input", sync);
  proxy.addEventListener("change", sync);
  form.addEventListener("submit", sync, { capture: true });

  label.append(caption, proxy);
  row.append(label);
  dateRow.insertAdjacentElement("afterend", row);

  originalLabel.hidden = true;
  originalLabel.setAttribute("aria-hidden", "true");
  originalRow.dataset.activ011OriginalPriceRow = "true";
  if (originalRow.classList.contains("form-row")) originalRow.style.gridTemplateColumns = "1fr";
};

const applyCreatePriceFieldPlacement = () => {
  document.querySelectorAll<HTMLFormElement>("form.create-form").forEach(enhanceCreatePriceField);
};

export const enableCreatePriceFieldPlacement = () => {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.queueMicrotask(() => {
      scheduled = false;
      applyCreatePriceFieldPlacement();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("focus", schedule);
  schedule();
};

enableCreatePriceFieldPlacement();
