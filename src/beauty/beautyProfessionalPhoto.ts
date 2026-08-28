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
