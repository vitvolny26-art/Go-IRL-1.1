import { supabase } from "./supabase";
import type { Language } from "./types";

export type PublicActivityPreview = {
  id: string;
  title: string;
  date: string;
  time: string;
  address: string;
  price: number;
};

type PublicActivityPreviewRow = {
  id: string;
  title_ru: string;
  title_cs: string;
  event_date: string;
  event_time: string;
  address: string;
  price: number;
};

type PublicActivityPreviewRpcClient = {
  rpc: (
    name: string,
    args: { p_requested_city_id: string; p_limit: number },
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const localizedTitle = (row: PublicActivityPreviewRow, language: Language) =>
  language === "cs" ? row.title_cs : row.title_ru;

export const loadPublicActivityPreviews = async (
  cityId: string,
  language: Language,
  dependencies: { client?: PublicActivityPreviewRpcClient } = {},
): Promise<PublicActivityPreview[]> => {
  const client = dependencies.client || (supabase as unknown as PublicActivityPreviewRpcClient);
  const result = await client.rpc("go_irl_list_public_activity_previews", {
    p_requested_city_id: cityId,
    p_limit: 8,
  });
  if (result.error) throw result.error;

  return ((result.data || []) as PublicActivityPreviewRow[]).slice(0, 4).map((row) => ({
    id: row.id,
    title: localizedTitle(row, language),
    date: row.event_date,
    time: row.event_time.slice(0, 5),
    address: row.address,
    price: Number(row.price) || 0,
  }));
};
