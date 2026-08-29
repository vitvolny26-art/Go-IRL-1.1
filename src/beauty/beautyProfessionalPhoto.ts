import "./beauty-professional-photo-square.css";
import { emptyBeautyLocalizedText, type BeautyPortfolioItem, type BeautyWorkspace } from "./beautySetupModel";

export const beautyProfessionalPhotoPortfolioId = "beauty-professional-photo";

export const isBeautyProfessionalPhotoItem = (item: Pick<BeautyPortfolioItem, "id">) =>
  item.id === beautyProfessionalPhotoPortfolioId;

export const getBeautyProfessionalPhoto = (portfolio: readonly BeautyPortfolioItem[]) =>
  portfolio.find(isBeautyProfessionalPhotoItem) || null;

export const getBeautyWorkPortfolio = (portfolio: readonly BeautyPortfolioItem[]) =>
  portfolio.filter((item) => !isBeautyProfessionalPhotoItem(item));

export const withBeautyProfessionalPhoto = (workspace: BeautyWorkspace, imageUrl: string): BeautyWorkspace => {
  const existing = getBeautyProfessionalPhoto(workspace.portfolio);
  const works = getBeautyWorkPortfolio(workspace.portfolio);
  const normalizedUrl = imageUrl.trim();
  if (!normalizedUrl) return { ...workspace, portfolio: works };

  const photo: BeautyPortfolioItem = {
    id: beautyProfessionalPhotoPortfolioId,
    imageUrl: normalizedUrl,
    altByLanguage: existing?.altByLanguage || emptyBeautyLocalizedText(),
    sortOrder: -1,
  };
  return { ...workspace, portfolio: [photo, ...works] };
};


const enableBeautyProfessionalPhotoCropper = () => {
  if (typeof document === "undefined") return;

  const processedFiles = new WeakSet<File>();
  const busyInputs = new WeakSet<HTMLInputElement>();

  document.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.type !== "file" || !input.closest(".beauty-workspace-professional-photo")) return;

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

    void import("../avatarCropper")
      .then(({ openAvatarCropper }) => openAvatarCropper(file, { previewShape: "square", outputSize: 1024 }))
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
  }, true);
};

enableBeautyProfessionalPhotoCropper();
