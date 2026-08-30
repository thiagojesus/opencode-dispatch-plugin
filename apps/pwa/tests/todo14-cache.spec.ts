import { expect, type Page, test } from "@playwright/test"

async function ensureServiceWorkerControl(page: Page): Promise<void> {
  await page.goto("/sessions")
  await page.evaluate(async () => navigator.serviceWorker.ready)
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) {
    await page.reload()
    await page.evaluate(async () => navigator.serviceWorker.ready)
  }
}

async function cachedUrls(page: Page): Promise<readonly string[]> {
  return page.evaluate(async () => {
    const urls: string[] = []
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName)
      for (const request of await cache.keys()) urls.push(request.url)
    }
    return urls
  })
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile", "Cache Storage inspection uses Chrome")
  await ensureServiceWorkerControl(page)
})

test("keeps API, WebSocket, session, and transcript traffic out of Cache Storage", async ({
  page,
}) => {
  await page.evaluate(async () => {
    await fetch("/api/v1/sessions?limit=1", {
      cache: "no-store",
      headers: { "cache-control": "no-store" },
    }).catch(() => undefined)
    await new Promise<void>((resolve) => {
      const socket = new WebSocket("ws://127.0.0.1:4175/api/v1/events")
      socket.addEventListener("error", () => resolve(), { once: true })
      socket.addEventListener("open", () => {
        socket.close()
        resolve()
      })
      globalThis.setTimeout(resolve, 500)
    })
  })

  const urls = await cachedUrls(page)
  expect(urls.length).toBeGreaterThan(0)
  expect(urls.every((url) => !/\/api\/|session|transcript|websocket/iu.test(url))).toBe(true)
})

test("removes stale Workbox precaches when an updated worker activates", async ({
  context,
  page,
}) => {
  const cacheNames = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    const currentPrecache = (await caches.keys()).find(
      (cacheName) => cacheName.includes("-precache-") && cacheName.includes(registration.scope),
    )
    if (currentPrecache === undefined) throw new Error("Current Workbox precache was not found")
    const stalePrecache = currentPrecache.replace("-precache-", "-precache-obsolete-")
    const cache = await caches.open(stalePrecache)
    await cache.put("/assets/todo14-obsolete.js", new Response("obsolete shell asset"))
    const updated = await navigator.serviceWorker.register(`/sw.js?todo14=${Date.now()}`, {
      scope: "/",
    })
    const waiting = updated.waiting ?? updated.installing
    if (waiting !== null && waiting.state !== "installed") {
      await new Promise<void>((resolve) => {
        const installed = (): void => {
          if (waiting.state !== "installed") return
          waiting.removeEventListener("statechange", installed)
          resolve()
        }
        waiting.addEventListener("statechange", installed)
      })
    }
    const activationWorker = updated.waiting ?? waiting
    activationWorker?.postMessage({ type: "SKIP_WAITING" })
    return { currentPrecache, stalePrecache }
  })

  const probe = await context.newPage()
  await probe.goto("/")
  await expect
    .poll(async () =>
      (await probe.evaluate(() => caches.keys())).includes(cacheNames.stalePrecache),
    )
    .toBe(false)
  await expect
    .poll(async () =>
      (await probe.evaluate(() => caches.keys())).includes(cacheNames.currentPrecache),
    )
    .toBe(true)
  await probe.close()
})
