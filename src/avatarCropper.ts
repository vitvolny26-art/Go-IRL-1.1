import type { Language } from "./types";

export type AvatarCropState = {
  zoom: number;
  x: number;
  y: number;
};

export type AvatarCropperOptions = {
  previewShape?: "circle" | "square";
  outputSize?: number;
};

type AvatarCropRect = {
  drawWidth: number;
  drawHeight: number;
  offsetX: number;
  offsetY: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const calculateAvatarCrop = (
  imageWidth: number,
  imageHeight: number,
  outputSize: number,
  state: AvatarCropState,
): AvatarCropRect => {
  const safeWidth = Math.max(1, imageWidth);
  const safeHeight = Math.max(1, imageHeight);
  const safeSize = Math.max(1, outputSize);
  const zoom = Math.max(1, state.zoom);
  const scale = Math.max(safeSize / safeWidth, safeSize / safeHeight) * zoom;
  const drawWidth = safeWidth * scale;
  const drawHeight = safeHeight * scale;

  return {
    drawWidth,
    drawHeight,
    offsetX: -(drawWidth - safeSize) * clamp(state.x, 0, 1),
    offsetY: -(drawHeight - safeSize) * clamp(state.y, 0, 1),
  };
};

const copy: Record<Language, {
  title: string;
  hint: string;
  squareHint: string;
  zoom: string;
  horizontal: string;
  vertical: string;
  cancel: string;
  apply: string;
}> = {
  ru: {
    title: "Обрезать фото",
    hint: "Настройте кадр так, чтобы лицо было в круге.",
    squareHint: "Кадрируйте фото в квадрат. Перетащите изображение и настройте масштаб.",
    zoom: "Приближение",
    horizontal: "Лево / право",
    vertical: "Выше / ниже",
    cancel: "Отмена",
    apply: "Готово",
  },
  uk: {
    title: "Обрізати фото",
    hint: "Налаштуйте кадр так, щоб обличчя було в колі.",
    squareHint: "Обріжте фото до квадрата. Перетягніть зображення та налаштуйте масштаб.",
    zoom: "Наближення",
    horizontal: "Ліворуч / праворуч",
    vertical: "Вище / нижче",
    cancel: "Скасувати",
    apply: "Готово",
  },
  cs: {
    title: "Oříznout fotografii",
    hint: "Nastavte výřez tak, aby byl obličej v kruhu.",
    squareHint: "Ořízněte fotografii do čtverce. Posuňte obrázek a upravte přiblížení.",
    zoom: "Přiblížení",
    horizontal: "Vlevo / vpravo",
    vertical: "Výše / níže",
    cancel: "Zrušit",
    apply: "Hotovo",
  },
  en: {
    title: "Crop photo",
    hint: "Position the image so the face is inside the circle.",
    squareHint: "Crop the photo to a square. Drag the image and adjust the zoom.",
    zoom: "Zoom",
    horizontal: "Left / right",
    vertical: "Up / down",
    cancel: "Cancel",
    apply: "Done",
  },
};

const getLanguage = (): Language => {
  const value = localStorage.getItem("go-irl-language");
  return value === "uk" || value === "cs" || value === "en" ? value : "ru";
};

const loadImage = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error("Avatar image could not be loaded"));
  };
  image.src = url;
});

const drawCrop = (
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  state: AvatarCropState,
) => {
  const context = canvas.getContext("2d");
  if (!context) return;
  const size = canvas.width;
  const rect = calculateAvatarCrop(image.naturalWidth, image.naturalHeight, size, state);
  context.clearRect(0, 0, size, size);
  context.drawImage(image, rect.offsetX, rect.offsetY, rect.drawWidth, rect.drawHeight);
};

const canvasToFile = (canvas: HTMLCanvasElement) => new Promise<File>((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) {
      reject(new Error("Avatar crop could not be created"));
      return;
    }
    resolve(new File([blob], `go-irl-avatar-${Date.now()}.jpg`, { type: "image/jpeg" }));
  }, "image/jpeg", 0.9);
});

export const openAvatarCropper = async (file: File, options: AvatarCropperOptions = {}): Promise<File | null> => {
  const image = await loadImage(file);
  const labels = copy[getLanguage()];
  const previewShape = options.previewShape ?? "circle";
  const outputSize = Math.max(1, Math.round(options.outputSize ?? 512));
  const hint = previewShape === "square" ? labels.squareHint : labels.hint;
  const state: AvatarCropState = { zoom: 1, x: 0.5, y: 0.35 };

  return new Promise<File | null>((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "avatar-cropper-backdrop";
    backdrop.innerHTML = `
      <section class="avatar-cropper-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-cropper-title">
        <h2 id="avatar-cropper-title">${labels.title}</h2>
        <p>${hint}</p>
        <div class="avatar-cropper-preview${previewShape === "square" ? " avatar-cropper-preview--square" : ""}"><canvas width="${outputSize}" height="${outputSize}"></canvas></div>
        <label><span>${labels.zoom}</span><input data-crop="zoom" type="range" min="1" max="3" step="0.01" value="1"></label>
        <label><span>${labels.horizontal}</span><input data-crop="x" type="range" min="0" max="1" step="0.01" value="0.5"></label>
        <label><span>${labels.vertical}</span><input data-crop="y" type="range" min="0" max="1" step="0.01" value="0.35"></label>
        <div class="avatar-cropper-actions">
          <button type="button" data-action="cancel">${labels.cancel}</button>
          <button type="button" data-action="apply">${labels.apply}</button>
        </div>
      </section>
    `;

    const canvas = backdrop.querySelector("canvas") as HTMLCanvasElement;
    const inputs = backdrop.querySelectorAll<HTMLInputElement>("input[data-crop]");
    const cancelButton = backdrop.querySelector<HTMLButtonElement>("[data-action='cancel']")!;
    const applyButton = backdrop.querySelector<HTMLButtonElement>("[data-action='apply']")!;
    const previousOverflow = document.body.style.overflow;
    const pointers = new Map<number, { x: number; y: number }>();
    let lastPanPoint: { x: number; y: number } | null = null;
    let pinchStart: { distance: number; zoom: number } | null = null;

    const syncInputs = () => {
      inputs.forEach((input) => {
        const key = input.dataset.crop as keyof AvatarCropState;
        input.value = String(state[key]);
      });
    };

    const redraw = () => {
      syncInputs();
      drawCrop(canvas, image, state);
    };

    const displayedPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const panBy = (dx: number, dy: number) => {
      const canvasRect = canvas.getBoundingClientRect();
      const crop = calculateAvatarCrop(image.naturalWidth, image.naturalHeight, canvas.width, state);
      const scaleX = canvas.width / Math.max(1, canvasRect.width);
      const scaleY = canvas.height / Math.max(1, canvasRect.height);
      const overflowX = crop.drawWidth - canvas.width;
      const overflowY = crop.drawHeight - canvas.height;
      if (overflowX > 0) state.x = clamp(state.x - dx * scaleX / overflowX, 0, 1);
      if (overflowY > 0) state.y = clamp(state.y - dy * scaleY / overflowY, 0, 1);
    };

    const pointerDistance = () => {
      const [first, second] = [...pointers.values()];
      return first && second ? Math.hypot(second.x - first.x, second.y - first.y) : 0;
    };

    const onPointerDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      const point = displayedPoint(event);
      pointers.set(event.pointerId, point);
      if (pointers.size === 1) lastPanPoint = point;
      if (pointers.size === 2) pinchStart = { distance: pointerDistance(), zoom: state.zoom };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      event.preventDefault();
      const point = displayedPoint(event);
      pointers.set(event.pointerId, point);
      if (pointers.size >= 2 && pinchStart) {
        const distance = pointerDistance();
        if (pinchStart.distance > 0) state.zoom = clamp(pinchStart.zoom * distance / pinchStart.distance, 1, 3);
        lastPanPoint = null;
      } else if (lastPanPoint) {
        panBy(point.x - lastPanPoint.x, point.y - lastPanPoint.y);
        lastPanPoint = point;
      }
      redraw();
    };

    const onPointerUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      pinchStart = null;
      lastPanPoint = pointers.size === 1 ? [...pointers.values()][0] : null;
    };

    const cleanup = () => {
      document.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      document.body.style.overflow = previousOverflow;
      backdrop.remove();
    };

    const finish = (result: File | null) => {
      cleanup();
      resolve(result);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(null);
    };

    inputs.forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.crop as keyof AvatarCropState;
        state[key] = Number(input.value);
        drawCrop(canvas, image, state);
      });
    });

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    cancelButton.addEventListener("click", () => finish(null));
    applyButtton.addEventListener("click", () => {
      applyButton.disabled = true;
      void canvasToFile(canvas)
        .then((cropped) => finish(cropped))
        .catch(() => {
          applyButton.disabled = false;
        });
    });

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    document.body.append(backdrop);
    drawCrop(canvas, image, state);
    applyButton.focus();
  });
};

export const enableAvatarCropper = () => {
  if (typeof document === "undefined") return () => undefined;

  const processedFiles = new WeakSet<File>();
  const busyInputs = new WeakSet<HTMLInputElement>();

  const handleImageSelection = (event: Event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.type !== "file" || !input.closest("#profile-edit-form")) return;

    const file = input.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (processedFiles.has(file)) {
      processedFiles.delete(file);
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    if (busyInputs.has(input)) return;
    busyInputs.add(input);

    void openAvatarCropper(file)
      .then((cropped) => {
        if (!cropped) {
          input.value = "";
          return;
        }

        const transfer = new DataTransfer();
        transfer.items.add(cropped);
        input.files = transfer.files;
        processedFiles.add(cropped);
        input.dispatchEvent(new Event("change", { bubbles: true }));
      })
      .catch(() => {
        input.value = "";
      })
      .finally(() => {
        busyInputs.delete(input);
      });
  };

  document.addEventListener("change", handleImageSelection, true);
  return () => document.removeEventListener("change", handleImageSelection, true);
};