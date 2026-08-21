import { buildMapProviderUrl } from "./mapProvider";
import type { MapProvider } from "./userPreferences";
type ActivityMapNavigationInput = { locationUrl?: string | null; address: string; cityName: string };
export const buildActivityMapSourceUrl = ({ locationUrl, address, cityName }: ActivityMapNavigationInput) => { const existing=locationUrl?.trim(); if(existing) return existing; const url=new URL("https://mapy.com/zakladni"); url.searchParams.set("q", address.trim() || cityName.trim()); return url.toString(); };
export const resolveActivityMapNavigation = (input: ActivityMapNavigationInput, provider: MapProvider | null | undefined) => { const sourceUrl=buildActivityMapSourceUrl(input); return { sourceUrl, targetUrl: provider ? buildMapProviderUrl(sourceUrl, provider) : null }; };
