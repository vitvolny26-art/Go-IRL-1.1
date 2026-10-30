import { handleCinemaDailyPublish } from "../_shared/cinema-route-handlers/daily-publish.js";

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
  end(body?: string): void;
};

const headerValue = (request: VercelRequest, name: string) => {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const origin = headerValue(request, "origin");
  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Origin", origin ?? "*");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.setHeader("Access-Control-Max-Age", "600");
    return response.status(204).end();
  }

  const headers = new Headers();
  const authorization = headerValue(request, "authorization");
  if (origin) headers.set("origin", origin);
  if (authorization) headers.set("authorization", authorization);
  headers.set("content-type", "application/json");

  const body = request.method === "POST"
    ? typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {})
    : undefined;
  const upstream = await handleCinemaDailyPublish(new Request("https://go-irl.fun/api/cinema/daily-publish", {
    method: request.method ?? "GET",
    headers,
    body,
  }));
  if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json; charset=utf-8");
  const allow = upstream.headers.get("allow");
  if (allow) response.setHeader("Allow", allow);
  response.status(upstream.status).end(await upstream.text());
}
