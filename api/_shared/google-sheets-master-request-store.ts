import {
  parseBeautyMasterRequestSheetValues,
  type BeautyMasterRequestRow,
  type BeautyMasterRequestStore,
} from "./beauty-master-request-store.js";
import { fetchGoogleCloudAccessToken } from "./google-cloud-access-token.js";

export const beautyMasterRequestsSpreadsheetId = "1WGQ7Mdhy25qxqVDBlmEa_2mXnpamk4geqKT5s8Zw5qE";
export const beautyMasterRequestsRange = "Requests!A:AL";

type SheetsValuesResponse = { values?: unknown };

type GoogleSheetsMasterRequestStoreOptions = {
  spreadsheetId?: string;
  range?: string;
  fetcher?: typeof fetch;
  accessTokenProvider?: () => Promise<string>;
};

export class GoogleSheetsMasterRequestStore implements BeautyMasterRequestStore {
  private readonly spreadsheetId: string;
  private readonly range: string;
  private readonly fetcher: typeof fetch;
  private readonly accessTokenProvider: () => Promise<string>;

  constructor(options: GoogleSheetsMasterRequestStoreOptions = {}) {
    this.spreadsheetId = options.spreadsheetId ?? beautyMasterRequestsSpreadsheetId;
    this.range = options.range ?? beautyMasterRequestsRange;
    this.fetcher = options.fetcher ?? fetch;
    this.accessTokenProvider = options.accessTokenProvider ?? (() => fetchGoogleCloudAccessToken(undefined, this.fetcher));
  }

  async listRequests(): Promise<BeautyMasterRequestRow[]> {
    const accessToken = await this.accessTokenProvider();
    const range = encodeURIComponent(this.range);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values/${range}?majorDimension=ROWS`;
    const response = await this.fetcher(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    });
    if (!response.ok) throw new Error("beauty_master_requests_sheet_failed");
    const payload = await response.json() as SheetsValuesResponse;
    return parseBeautyMasterRequestSheetValues(payload.values);
  }
}
