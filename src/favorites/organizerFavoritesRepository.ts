import type { SupabaseClient } from "@supabase/supabase-js";

export type OrganizerFavoriteState = {
  organizerUserKey: string;
  isFavorite: boolean;
  updatedAt?: string | null;
};

export interface OrganizerFavoritesRepository {
  load(organizerUserKey: string): Promise<OrganizerFavoriteState>;
  loadActive(): Promise<OrganizerFavoriteState[]>;
  set(organizerUserKey: string, isFavorite: boolean): Promise<OrganizerFavoriteState>;
}

type FavoriteRow = {
  subject_id: string;
  status: "active" | "removed";
  updated_at?: string | null;
};

const mapFavorite = (row: FavoriteRow): OrganizerFavoriteState => ({
  organizerUserKey: row.subject_id,
  isFavorite: row.status === "active",
  updatedAt: row.updated_at ?? null,
});

export class SupabaseOrganizerFavoritesRepository implements OrganizerFavoritesRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userKey: string,
  ) {}

  async load(organizerUserKey: string): Promise<OrganizerFavoriteState> {
    const result = await this.client
      .from("favorites")
      .select("subject_id, status, updated_at")
      .eq("user_key", this.userKey)
      .eq("subject_type", "organizer")
      .eq("subject_id", organizerUserKey)
      .maybeSingle();

    if (result.error) throw result.error;

    const row = result.data as FavoriteRow | null;
    return row ? mapFavorite(row) : {
      organizerUserKey,
      isFavorite: false,
      updatedAt: null,
    };
  }

  async loadActive(): Promise<OrganizerFavoriteState[]> {
    const result = await this.client
      .from("favorites")
      .select("subject_id, status, updated_at")
      .eq("user_key", this.userKey)
      .eq("subject_type", "organizer")
      .eq("status", "active")
      .order("updated_at", { ascending: false });

    if (result.error) throw result.error;
    return ((result.data || []) as FavoriteRow[]).map(mapFavorite).filter((favorite) => favorite.isFavorite);
  }

  async set(organizerUserKey: string, isFavorite: boolean): Promise<OrganizerFavoriteState> {
    const now = new Date().toISOString();
    const result = await this.client
      .from("favorites")
      .upsert({
        user_key: this.userKey,
        subject_type: "organizer",
        subject_id: organizerUserKey,
        organizer_user_key: organizerUserKey,
        status: isFavorite ? "active" : "removed",
        source: "organizer_profile",
        removed_at: isFavorite ? null : now,
        updated_at: now,
      }, { onConflict: "user_key,subject_type,subject_id" })
      .select("subject_id, status, updated_at")
      .single();

    if (result.error) throw result.error;

    return mapFavorite(result.data as FavoriteRow);
  }
}

export const createOrganizerFavoritesRepository = (
  client: SupabaseClient,
  userKey: string,
): OrganizerFavoritesRepository => new SupabaseOrganizerFavoritesRepository(client, userKey);
