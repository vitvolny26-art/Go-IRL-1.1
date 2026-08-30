import type { BeautyContentLanguage } from "./beautySetupModel";

export type BeautyShareCardGeneratedBatch = Record<BeautyContentLanguage, string>;

const generatedBatches = new Map<string, BeautyShareCardGeneratedBatch>();

export const cacheBeautyShareCardGeneratedBatch = (
  fingerprint: string,
  images: BeautyShareCardGeneratedBatch,
) => {
  generatedBatches.clear();
  generatedBatches.set(fingerprint, images);
};

export const getBeautyShareCardGeneratedBatch = (fingerprint: string) =>
  generatedBatches.get(fingerprint) || null;

export const clearBeautyShareCardGeneratedBatch = () => {
  generatedBatches.clear();
};