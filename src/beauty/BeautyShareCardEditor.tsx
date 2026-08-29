import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, ImagePlus, RefreshCw, Trash2, Upload } from "lucide-react";
import type { Language } from "../types";
import {
  resolveBeautyLocalizedText,
  type BeautyShareCard,
  type BeautyWorkspace,
} from "./beautySetupModel";
import {
  buildBeautyShareCardFingerprint,
  resolveBeautyShareCardServices,
} from "./beautyShareCardModel";
import { resolveBeautySpecializationPresentation } from "./beautySpecializationPresentation";
import { buildBeautyShareCardPreviewSvg } from "./beautyShareCardPreview";
import {
  beautyShareCardPersistenceEvent,
  type BeautyShareCardPersistenceDetail,
} from "./beautyWorkspaceStorage";
import "./beauty-share-card-editor.css";

const localeByLanguage: Record<Language, string> = {
  ru: "ru-RU",
  uk: "uk-UA",
  cs: "cs-CZ",
  en: "en-GB",
};

const copy = {
  ru: {
    title: "Визитка для шаринга",
    hint: "Предпросмотр Telegram-визитки. Данные берутся из профиля и прайса.",
    background: "Фон визитки",
    logo: "Логотип или аватар",
    uploadBackground: "Загрузить фон",
    uploadLogo: "Загрузить лого",
    reset: "Вернуть стандартный",
    position: "Положение фона",
    services: "Услуги на визитке",
    servicesHint: "Выберите до трёх активных услуг и задайте порядок.",
    ready: "● Визитка готова",
    updating: "◌ Визитка обновляется…",
    error: "⚠ Не удалось обновить",
    deleted: "— Визитка удалена",
    retry: "Повторить",
    update: "Обновить визитку",
    create: "Создать визитку",
    remove: "Удалить визитку",
    download: "Скачать JPEG",
    imageError: "Не удалось обработать изображение. Используйте JPG, PNG или WebP до 6 МБ.",
    maxServices: "Можно выбрать не более трёх услуг.",
    emptyServices: "Сначала добавьте активную услугу в прайс.",
  },
  uk: {
    title: "Візитка для поширення",
    hint: "Попередній перегляд Telegram-візитки. Дані беруться з профілю та прайса.",
    background: "Фон візитки",
    logo: "Логотип або аватар",
    uploadBackground: "Завантажити фон",
    uploadLogo: "Завантажити лого",
    reset: "Повернути стандартний",
    position: "Положення фону",
    services: "Послуги на візитці",
    servicesHint: "Оберіть до трьох активних послуг і задайте порядок.",
    ready: "● Візитка готова",
    updating: "◌ Візитка оновлюється…",
    error: "⚠ Не вдалося оновити",
    deleted: "— Візитка видалена",
    retry: "Повторити",
    update: "Оновити визитку",
    create: "Створити визитку",
    remove: "Видалити визитку",
    download: "Завантажити JPEG",
    imageError: "Не вдалося обробити зображення. Використовуйте JPG, PNG або WebP до 6 МБ.",
    maxServices: "Можна обрати не більше трьох послуг.",
    emptyServices: "Спочатку додайте активну послугу до прайса.",
  },
  cs: {
    title: "Vizitka pro sdílení",
    hint: "Náhled Telegram vizitky. Údaje se přebírají z profilu a ceníku.",
    background: "Pozadí vizitky",
    logo: "Logo nebo avatar",
    uploadBackground: "Nahrát pozadí",
    uploadLogo: "Nahrát logo",
    reset: "Obnovit výchozí",
    position: "Pozice pozadí",
    services: "Služby na vizitce",
    servicesHint: "Vyberte až tři aktivní služby a nastavte pořadí.",
    ready: "● Vizitka je připravena",
    updating: "◌ Vizitka se aktualizuje…",
    error: "⚠ Aktualizace se nezdařila",
    deleted: "— Vizitka byla odstraněna",
    retry: "Zkusit znovu",
    update: "Aktualizovat vizitku",
    create: "Vytvořit vizitku",
    remove: "Odstranit vizitku",
    download: "Stáhnout JPEG",
    imageError: "Obrázek se nepodařilo zpracovat. Použijte JPG, PNG nebo WebP do 6 MB.",
    maxServices: "Lze vybrat nejvýše tři služby.",
    emptyServices: "Nejprve přidejte aktivní službu do ceníku.",
  },
  en: {
    title: "Sharing business card",
    hint: "Telegram business-card preview. Content comes from the profile and price list.",
    background: "Card background",
    logo: "Logo or avatar",
    uploadBackground: "Upload background",
    uploadLogo: "Upload logo",
    reset: "Restore default",
    position: "Background position",
    services: "Services on the card",
    servicesHint: "Choose up to three active services and set their order.",
    ready: "● Business card ready",
    updating: "◌ Business card updating…",
    error: "⚠ Update failed",
    deleted: "— Business card deleted",
    retry: "Retry",
    update: "Update business card",
    create: "Create business card",
    remove: "Delete business card",
    download: "Download JPEG",
    imageError: "The image could not be processed. Use JPG, PNG or WebP up to 6 MB.",
    maxServices: "You can select up to three services.",
    emptyServices: "Add an active service to the price list first.",
  },
} satisfies Record<Language, Record<string, string>>;

const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  if (source.startsWith("https://") || source.startsWith("http://")) image.crossOrigin = "anonymous";
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("beauty_share_image_load_failed"));
  image.src = source;
});

const drawCoverAt = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  positionY: number,
) => {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const scaledWidth = image.naturalWidth * scale;
  const scaledHeight = image.naturalHeight * scale;
  const left = x + (width - scaledWidth) / 2;
  const top = y - (scaledHeight - height) * (positionY / 100);
  context.drawImage(image, left, top, scaledWidth, scaledHeight);
};

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
};

const beautyShareTitlePattern = /<text data-beauty-premium-title="true"[^>]*>[\s\S]*?<\/text>/u;

export const renderBeautyShareCard = async (workspace: BeautyWorkspace, language: Language) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 900;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("beauty_share_canvas_unavailable");

  const presentation = resolveBeautySpecializationPresentation(workspace);
  const background = await loadImage(workspace.shareCard.backgroundImageDataUrl || presentation.defaultArtwork);
  drawCoverAt(context, background, 0, 0, canvas.width, canvas.height, workspace.shareCard.backgroundPositionY);

  const svg = buildBeautyShareCardPreviewSvg(workspace, language).replace(beautyShareTitlePattern, "");
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const overlay = await loadImage(svgUrl);
    context.drawImage(overlay, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
  const { drawBeautyShareTitle } = await import("./beautyShareTitleCanvas");
  await drawBeautyShareTitle(context, workspace);

  const logoSource = workspace.shareCard.logoImageDataUrl || presentation.defaultIcon;
  if (logoSource) {
    const logo = await loadImage(logoSource);
    context.save();
    roundedRect(context, 841, 71, 158, 158, 12);
    context.clip();
    drawCoverAt(context, logo, 841, 71, 158, 158, 50);
    context.restore();
  }

  return canvas.toDataURL("image/jpeg", 0.9);
};

const prepareUploadedImage = (file: File, preserveTransparency: boolean) => new Promise<string>((resolve, reject) => {
  if (!file.type.startsWith("image/") || file.size > 6 * 1024 * 1024) return reject(new Error("beauty_share_image_invalid"));
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error || new Error("beauty_share_image_read_failed"));
  reader.onload = async () => {
    try {
      const image = await loadImage(String(reader.result || ""));
      const maxSide = preserveTransparency ? 900 : 1800;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("beauty_share_canvas_unavailable");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(preserveTransparency ? "image/png" : "image/jpeg", 0.88));
    } catch (error) {
      reject(error);
    }
  };
  reader.readAsDataURL(file);
});

const statusClass = (status: BeautyShareCard["status"]) => `is-${status}`;

export function BeautyShareCardEditor({
  workspace,
  language,
  onChange,
}: {
  workspace: BeautyWorkspace;
  language: Language;
  onChange: (next: BeautyWorkspace) => void;
}) {
  const text = copy[language];
  const [retryKey, setRetryKey] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const workspaceRef = useRef(workspace);
  const onChangeRef = useRef(onChange);
  workspaceRef.current = workspace;
  onChangeRef.current = onChange;

  useEffect(() => {
    const handlePersistence = (event: Event) => {
      const detail = (event as CustomEvent<BeautyShareCardPersistenceDetail>).detail;
      const current = workspaceRef.current;
      if (!detail || current.shareCard.sourceFingerprint !== detail.sourceFingerprint) return;
      onChangeRef.current({
        ...current,
        shareCard: {
          ...current.shareCard,
          status: detail.status,
          errorMessage: detail.errorMessage,
        },
      });
    };
    window.addEventListener(beautyShareCardPersistenceEvent, handlePersistence);
    return () => window.removeEventListener(beautyShareCardPersistenceEvent, handlePersistence);
  }, []);

  const fingerprint = useMemo(
    () => buildBeautyShareCardFingerprint(workspace, language),
    [language, workspace],
  );
  const selectedServices = useMemo(
    () => resolveBeautyShareCardServices(workspace, language),
    [language, workspace],
  );
  const activeServices = workspace.services.filter((service) => service.active);

  const updateShareCard = (patch: Partial<BeautyShareCard>) => {
    const current = workspaceRef.current;
    onChangeRef.current({ ...current, shareCard: { ...current.shareCard, ...patch } });
  };

  useEffect(() => {
    if (!workspace.shareCard.enabled) return;
    if (
      workspace.shareCard.status === "ready"
      && workspace.shareCard.sourceFingerprint === fingerprint
      && workspace.shareCard.generatedImageDataUrl
    ) return;

    if (workspace.shareCard.status !== "updating") updateShareCard({ status: "updating", errorMessage: "" });
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const source = workspaceRef.current;
      const expectedFingerprint = buildBeautyShareCardFingerprint(source, language);
      void renderBeautyShareCard(source, language)
        .then((generatedImageDataUrl) => {
          if (cancelled) return;
          const current = workspaceRef.current;
          if (buildBeautyShareCardFingerprint(current, language) !== expectedFingerprint) return;
          onChangeRef.current({
            ...current,
            shareCard: {
              ...current.shareCard,
              status: "updating",
              generatedImageDataUrl,
              generatedAt: new Date().toISOString(),
              sourceFingerprint: expectedFingerprint,
              errorMessage: "",
            },
          });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const current = workspaceRef.current;
          onChangeRef.current({
            ...current,
            shareCard: {
              ...current.shareCard,
              status: "error",
              errorMessage: error instanceof Error ? error.message : "beauty_share_generation_failed",
            },
          });
        });
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fingerprint, language, retryKey, workspace.shareCard.enabled]);

  const upload = async (file: File | undefined, kind: "background" | "logo") => {
    if (!file) return;
    setUploadError("");
    try {
      const dataUrl = await prepareUploadedImage(file, kind === "logo");
      updateShareCard({
        [kind === "background" ? "backgroundImageDataUrl" : "logoImageDataUrl"]: dataUrl,
        status: "updating",
        errorMessage: "",
      });
    } catch {
      setUploadError(text.imageError);
    }
  };

  const setServiceIds = (serviceIds: string[]) => updateShareCard({
    serviceIds: serviceIds.slice(0, 3),
    status: "updating",
    errorMessage: "",
  });

  const toggleService = (id: string) => {
    const ids = selectedServices.map((service) => service.id);
    if (ids.includes(id)) return setServiceIds(ids.filter((serviceId) => serviceId !== id));
    if (ids.length >= 3) return setUploadError(text.maxServices);
    setUploadError("");
    setServiceIds([...ids, id]);
  };

  const moveService = (id: string, direction: -1 | 1) => {
    const ids = selectedServices.map((service) => service.id);
    const index = ids.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setServiceIds(ids);
  };

  const generatedTime = workspace.shareCard.generatedAt
    ? new Intl.DateTimeFormat(localeByLanguage[language], { hour: "2-digit", minute: "2-digit" })
      .format(new Date(workspace.shareCard.generatedAt))
    : "";
  const statusText = text[workspace.shareCard.status];

  return <section className="beauty-share-card-editor">
    <header className="beauty-share-card-heading">
      <div><span>SHARE CARD</span><h2>{text.title}</h2><p>{text.hint}</p></div>
      <div className={`beauty-share-card-status ${statusClass(workspace.shareCard.status)}`} role="status" aria-live="polite">
        <strong>{statusText}{workspace.shareCard.status === "ready" && generatedTime ? ` · ${generatedTime}` : ""}</strong>
        {workspace.shareCard.status === "error" && <button type="button" onClick={() => setRetryKey((value) => value + 1)}>{text.retry}</button>}
      </div>
    </header>

    <div className="beauty-share-card-layout">
      <div className="beauty-share-card-preview-column">
        <div className="beauty-share-card-preview" aria-label={text.title}>
          {workspace.shareCard.generatedImageDataUrl
            ? <img src={workspace.shareCard.generatedImageDataUrl} alt={text.title} />
            : <div className="beauty-share-card-empty"><ImagePlus /><span>{statusText}</span></div>}
          {workspace.shareCard.status === "updating" && <div className="beauty-share-card-updating"><RefreshCw />{text.updating}</div>}
        </div>

        <div className="beauty-share-card-controls beauty-share-card-upload-row beauty-share-card-media-actions">
          <section>
            <h3>{text.background}</h3>
            <div className="beauty-share-card-upload-row">
              <label><Upload />{text.uploadBackground}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload(event.target.files?.[0], "background")} /></label>
              {workspace.shareCard.backgroundImageDataUrl && <button type="button" onClick={() => updateShareCard({ backgroundImageDataUrl: "", status: "updating" })}>{text.reset}</button>}
            </div>
            <label className="beauty-share-card-range"><span>{text.position}</span><input type="range" min="0" max="100" value={workspace.shareCard.backgroundPositionY} onChange={(event) => updateShareCard({ backgroundPositionY: Number(event.target.value), status: "updating" })} /></label>
          </section>

          <section>
            <h3>{text.logo}</h3>
            <div className="beauty-share-card-upload-row">
              <label><Upload />{text.uploadLogo}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload(event.target.files?.[0], "logo")} /></label>
              {workspace.shareCard.logoImageDataUrl && <button type="button" onClick={() => updateShareCard({ logoImageDataUrl: "", status: "updating" })}>{text.reset}</button>}
            </div>
          </section>
        </div>
      </div>

      <div className="beauty-share-card-controls">
        <section>
          <h3>{text.services}</h3><p>{text.servicesHint}</p>
          {activeServices.length ? <div className="beauty-share-card-services">
            {activeServices.map((service) => {
              const selectedIndex = selectedServices.findIndex((item) => item.id === service.id);
              return <div className={selectedIndex >= 0 ? "is-selected" : ""} key={service.id}>
                <label><input type="checkbox" checked={selectedIndex >= 0} onChange={() => toggleService(service.id)} /><span>{resolveBeautyLocalizedText(service.nameByLanguage, language, service.name)}</span><b>{service.priceCzk} Kč</b></label>
                {selectedIndex >= 0 && <div><button type="button" disabled={selectedIndex === 0} onClick={() => moveService(service.id, -1)}><ArrowUp /></button><button type="button" disabled={selectedIndex === selectedServices.length - 1} onClick={() => moveService(service.id, 1)}><ArrowDown /></button></div>}
              </div>;
            })}
          </div> : <p className="beauty-share-card-warning">{text.emptyServices}</p>}
        </section>

        {uploadError && <p className="beauty-share-card-warning" role="alert">{uploadError}</p>}

        <div className="beauty-share-card-actions">
          {!workspace.shareCard.enabled
            ? <button className="beauty-primary" type="button" onClick={() => updateShareCard({ enabled: true, status: "updating", sourceFingerprint: "" })}>{text.create}</button>
            : <>
              <button className="beauty-primary" type="button" onClick={() => { updateShareCard({ status: "updating", sourceFingerprint: "" }); setRetryKey((value) => value + 1); }}><RefreshCw />{text.update}</button>
              {workspace.shareCard.generatedImageDataUrl && <a href={workspace.shareCard.generatedImageDataUrl} download="go-irl-beauty-card.jpg"><Download />{text.download}</a>}
              <button className="beauty-share-card-delete" type="button" onClick={() => updateShareCard({ enabled: false, status: "deleted", generatedImageDataUrl: "", generatedAt: "", sourceFingerprint: "", errorMessage: "" })}><Trash2 />{text.remove}</button>
            </>}
        </div>
      </div>
    </div>
  </section>;
}
