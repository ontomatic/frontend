import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("..", import.meta.url)),
  resolve: { tsconfigPaths: true },
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, ws: false },
});
after(() => server.close());

const { action, loader } = await server.ssrLoadModule("/app/routes/api-proxy.ts");
const appUrl = "http://localhost:5173";
const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
const storageUrl = "http://rustfs:9000";
const signedPath = "/bucket/object?X-Amz-Signature=abc&response-content-disposition=attachment%3B%20filename%3Da.pdf";

await test("passes through signed file URLs when the frontend runs without the Nginx proxy", async (t) => {
  delete process.env.S3_ENDPOINT_URL;
  const url = `http://localhost:9000${signedPath}`;
  t.mock.method(globalThis, "fetch", async (target) => {
    if (target.pathname.endsWith("/download")) return Response.json({ url });
    return Response.json([{ file_id: 12, upload_url: url }]);
  });

  const upload = await action({ request: new Request(`${appUrl}/api/v1/uploads`, { method: "POST" }) });
  assert.deepEqual(await upload.json(), [{ file_id: 12, upload_url: url }]);
  const download = await loader({ request: new Request(`${appUrl}/api/v1/workspace/documents/id/download`) });
  assert.deepEqual(await download.json(), { url });
});

process.env.S3_ENDPOINT_URL = storageUrl;

await test("forwards upload metadata with authorization and returns a same-origin file URL", async (t) => {
  t.mock.method(globalThis, "fetch", async (target, options) => {
    assert.equal(target.href, `${backendUrl}/api/v1/uploads?kind=auto`);
    assert.equal(options.method, "POST");
    assert.equal(options.headers.get("authorization"), "Bearer token");
    assert.deepEqual(await new Response(options.body).json(), { kind: "auto" });
    return Response.json([{ file_id: 12, upload_url: `${storageUrl}${signedPath}` }]);
  });

  const response = await action({
    request: new Request(`${appUrl}/api/v1/uploads?kind=auto`, {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "auto" }),
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), [{ file_id: 12, upload_url: `/storage${signedPath}` }]);
});

await test("rewrites signed downloads and passes authentication errors through", async (t) => {
  t.mock.method(globalThis, "fetch", async (target) => {
    if (target.pathname.endsWith("/download")) return Response.json({ url: `${storageUrl}${signedPath}` });
    return Response.json({ message: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  });

  const download = await loader({ request: new Request(`${appUrl}/api/v1/workspace/documents/id/download`) });
  assert.deepEqual(await download.json(), { url: `/storage${signedPath}` });

  const denied = await loader({ request: new Request(`${appUrl}/api/v1/auth/me`) });
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get("www-authenticate"), "Bearer");
  assert.deepEqual(await denied.json(), { message: "Unauthorized" });
});
