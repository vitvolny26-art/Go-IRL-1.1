/* global fetch, WebSocket */
import { createServer } from "node:http";
import console from "node:console";
import process from "node:process";
import { setTimeout, clearTimeout } from "node:timers";
import { URL } from "node:url";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

const distDir = join(process.cwd(), "dist");
const sourceMain = join(process.cwd(), "src", "main.tsx");
const chromiumPath = process.env.CHROMIUM_PATH || "/home/goirl-runner/.cache/goirl-web002-chromium/bin/chromium";
const mime = new Map([
  [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".png", "image/png"], [".svg", "image/svg+xml"], [".ico", "image/x-icon"], [".txt", "text/plain; charset=utf-8"],
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function exists(path) { try { await stat(path); return true; } catch { return false; } }

async function startServer() {
  assert(await exists(join(distDir, "index.html")), "dist/index.html missing; run pnpm run build first");
  const server = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname);
      const safePath = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^[/\\]+/, "");
      let file;
      if (!extname(pathname)) {
        file = join(distDir, "index.html");
      } else {
        file = join(distDir, safePath);
        if (!(await exists(file)) || (await stat(file)).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
      }
      const body = await readFile(file);
      res.writeHead(200, { "content-type": mime.get(extname(file)) || "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch (error) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(String(error));
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return { server, port: server.address().port };
}

async function launchChromium() {
  assert(await exists(chromiumPath), `Chromium executable missing: ${chromiumPath}`);
  const profile = await mkdtemp(join(tmpdir(), "goirl-web002-a2-"));
  const chrome = spawn(chromiumPath, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--no-first-run", "--no-default-browser-check", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = ""; chrome.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const portFile = join(profile, "DevToolsActivePort");
  let cdpPort = "";
  for (let i = 0; i < 100; i += 1) {
    if (chrome.exitCode !== null) throw new Error(`Chromium exited early (${chrome.exitCode}): ${stderr.slice(-2000)}`);
    if (await exists(portFile)) { cdpPort = (await readFile(portFile, "utf8")).split(/\r?\n/)[0]?.trim(); if (cdpPort) break; }
    await sleep(100);
  }
  assert(cdpPort, `Chromium CDP port missing: ${stderr.slice(-2000)}`);
  return { chrome, profile, cdpPort };
}

async function newPage(cdpPort, url) {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  assert(response.ok, `CDP target create failed: ${response.status}`);
  const target = await response.json();
  assert(target.webSocketDebuggerUrl, "CDP target websocket missing");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("CDP websocket open timeout")), 5000);
    ws.onopen = () => { clearTimeout(timeout); resolve(); };
    ws.onerror = () => reject(new Error("CDP websocket open failed"));
  });
  let id = 0;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id;
    const timeout = setTimeout(() => { ws.removeEventListener("message", onMessage); reject(new Error(`${method} timeout`)); }, 8000);
    const onMessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== callId) return;
      ws.removeEventListener("message", onMessage); clearTimeout(timeout);
      if (msg.error) reject(new Error(`${method}: ${JSON.stringify(msg.error)}`)); else resolve(msg.result);
    };
    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable"); await call("ServiceWorker.enable");
  return { ws, call };
}

async function evaluate(call, expression, awaitPromise = false) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(`Runtime.evaluate failed: ${result.exceptionDetails.text || "exception"}`);
  return result.result?.value;
}

async function waitFor(call, expression, description, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    if (await evaluate(call, expression, true)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function navigate(call, url) {
  await call("Page.navigate", { url });
  await waitFor(call, "document.readyState === 'complete'", `load ${url}`);
}

async function shellSmoke(call, origin, width, height, mobile) {
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await navigate(call, `${origin}/`);
  const state = await evaluate(call, `(() => ({ text: document.body?.innerText?.trim() || '', scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))()`);
  assert(state.text.length > 20, `${mobile ? "mobile" : "desktop"} shell is unexpectedly empty`);
  assert(state.scrollWidth <= state.innerWidth + 2, `${mobile ? "mobile" : "desktop"} shell horizontal overflow: ${state.scrollWidth} > ${state.innerWidth}`);
}

const { server, port } = await startServer();
const origin = `http://127.0.0.1:${port}`;
let serverClosed = false;
let browser;
try {
  browser = await launchChromium();
  const page = await newPage(browser.cdpPort, `${origin}/`);
  try {
    await navigate(page.call, `${origin}/`);
    const manifest = await evaluate(page.call, `fetch('/manifest.webmanifest').then(r => { if (!r.ok) throw new Error('manifest '+r.status); return r.json(); })`, true);
    assert(manifest.id === "/", `manifest.id expected /, got ${manifest.id}`);
    assert(manifest.start_url === "/", `manifest.start_url expected /, got ${manifest.start_url}`);
    assert(manifest.scope === "/", `manifest.scope expected /, got ${manifest.scope}`);
    assert(manifest.display === "standalone", `manifest.display expected standalone, got ${manifest.display}`);
    const sizes = new Set((manifest.icons || []).map((icon) => icon.sizes));
    assert(sizes.has("192x192") && sizes.has("512x512"), "manifest icons 192x192/512x512 missing");
    console.log("manifest=green");

    const mainSource = await readFile(sourceMain, "utf8");
    assert(mainSource.includes('navigator.serviceWorker.register("/service-worker.js")'), "production service-worker registration contract missing from src/main.tsx");
    console.log("service_worker_registration_contract=green");
    const cacheProbe = await evaluate(page.call, `(async()=>{
      const urls=['/','/activities','/services','/beauty','/offline.html'];
      const fetches=[];
      for (const url of urls) {
        try { const r=await fetch(url); fetches.push({url,status:r.status,ok:r.ok,type:r.type}); }
        catch (error) { fetches.push({url,error:String(error)}); }
      }
      let addAll;
      try { const c=await caches.open('__web002_a2_probe'); await c.addAll(urls); addAll={ok:true}; await caches.delete('__web002_a2_probe'); }
      catch(error) { addAll={ok:false,error:String(error)}; }
      return {fetches,addAll};
    })()`, true);
    console.log(`cache_probe=${JSON.stringify(cacheProbe)}`);
    assert(cacheProbe.fetches.every((entry) => entry.ok), `app shell fetch probe failed: ${JSON.stringify(cacheProbe.fetches)}`);
    assert(cacheProbe.addAll.ok, `app shell cache.addAll probe failed: ${cacheProbe.addAll.error}`);
    const swEvents = [];
    const onSwEvent = (event) => {
      const message = JSON.parse(event.data);
      if (message.method?.startsWith("ServiceWorker.")) swEvents.push(message);
    };
    page.ws.addEventListener("message", onSwEvent);
    await evaluate(page.call, `navigator.serviceWorker.register('/service-worker.js').then(r => ({scope:r.scope}))`, true);
    let swLifecycle;
    for (let i = 0; i < 120; i += 1) {
      swLifecycle = await evaluate(page.call, `(async()=>{ const r=await navigator.serviceWorker.getRegistration(); return r ? {installing:r.installing?.state||null,waiting:r.waiting?.state||null,active:r.active?.state||null} : null; })()`, true);
      if (swLifecycle?.active === "activated") break;
      if (swLifecycle?.installing === "redundant" || swLifecycle?.waiting === "redundant" || swLifecycle?.active === "redundant") break;
      await sleep(100);
    }
    page.ws.removeEventListener("message", onSwEvent);
    if (swLifecycle?.active !== "activated") {
      console.error(`service_worker_lifecycle=${JSON.stringify(swLifecycle)}`);
      console.error(`service_worker_events=${JSON.stringify(swEvents.slice(-20))}`);
      throw new Error("service worker did not activate");
    }
    if (!(await evaluate(page.call, "!!navigator.serviceWorker.controller"))) {
      await page.call("Page.reload", { ignoreCache: true });
      await waitFor(page.call, "document.readyState === 'complete'", "reload for service worker control");
    }
    await waitFor(page.call, "!!navigator.serviceWorker.controller", "service worker control", 80);
    const swState = await evaluate(page.call, `(async()=>{ const r=await navigator.serviceWorker.getRegistration(); return {scope:r?.scope, active:r?.active?.state, controlled:!!navigator.serviceWorker.controller}; })()`, true);
    assert(swState.controlled && swState.active === "activated", `service worker not active/controlling: ${JSON.stringify(swState)}`);
    console.log("service_worker_control=green");

    for (const route of ["/activities", "/services"]) {
      const routeLiteral = JSON.stringify(route);
      await navigate(page.call, origin + route);
      await waitFor(page.call, `location.pathname === ${routeLiteral} && document.querySelector('#root')?.innerHTML?.length > 0`, `render ${route}`);
      await page.call("Page.reload", { ignoreCache: true });
      await waitFor(page.call, `location.pathname === ${routeLiteral} && document.readyState === 'complete' && document.querySelector('#root')?.innerHTML?.length > 0`, `reload ${route}`);
      const state = await evaluate(page.call, `({path:location.pathname,rootHtml:document.querySelector('#root')?.innerHTML?.length||0})`);
      assert(state.path === route && state.rootHtml > 0, `deep link reload failed for ${route}: ${JSON.stringify(state)}`);
      console.log(`deep_link_reload=${route}:green`);
    }

    await shellSmoke(page.call, origin, 1440, 900, false);
    console.log("desktop_shell=green");
    await shellSmoke(page.call, origin, 390, 844, true);
    console.log("mobile_shell=green");

    await navigate(page.call, `${origin}/`);
    await waitFor(page.call, "!!navigator.serviceWorker.controller", "service worker controller before offline smoke");
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    serverClosed = true;
    const offlineUrl = `${origin}/web002-offline-${Date.now()}`;
    await page.call("Page.navigate", { url: offlineUrl });
    await waitFor(page.call, `document.body?.innerText?.includes('Нет соединения') === true`, "offline fallback", 100);
    assert((await evaluate(page.call, "document.title")).includes("нет соединения"), "offline fallback title mismatch");
    console.log("offline_fallback=green");
    console.log("GO_IRL_WEB002_A2_BROWSER_PWA_GREEN");
  } finally {
    page.ws.close();
  }
} finally {
  if (!serverClosed) server.close();
  if (browser) {
    browser.chrome.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => browser.chrome.once("exit", resolve)), sleep(2000)]);
    if (browser.chrome.exitCode === null) browser.chrome.kill("SIGKILL");
    await rm(browser.profile, { recursive: true, force: true });
  }
}
