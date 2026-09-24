export async function verifySupabaseServiceRoleCredential(
  token: string | null,
  supabaseUrl: string,
  fetchImpl: typeof fetch = fetch,
) {
  if (!token || !supabaseUrl) return false;

  try {
    const url = new URL("/auth/v1/admin/users", supabaseUrl.replace(/\/+$/, "") + "/");
    url.searchParams.set("page", "1");
    url.searchParams.set("per_page", "1");
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        apikey: token,
        authorization: `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
