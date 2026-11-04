const requestHeaders = ["authorization", "accept", "content-type", "content-length"];
const responseHeaders = ["allow", "cache-control", "content-type", "retry-after", "www-authenticate"];

const browserStorageUrl = (value: string) => {
  const endpoint = process.env.S3_ENDPOINT_URL;
  // The Nginx deployment sets this on the frontend to route files through /storage/.
  if (!endpoint) return value;

  const url = new URL(value);
  if (url.origin !== new URL(endpoint).origin) throw new Error("Unexpected storage endpoint");
  return `/storage${url.pathname}${url.search}`;
};

const proxyApi = async ({ request }: { request: Request }) => {
  try {
    const { pathname, search } = new URL(request.url);
    const target = new URL(process.env.BACKEND_URL || "http://localhost:8000");
    target.pathname = pathname;
    target.search = search;

    const headers = new Headers({ "Accept-Encoding": "identity" });
    for (const name of requestHeaders) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    const options: RequestInit & { duplex: "half" } = {
      method: request.method,
      headers,
      body: request.body,
      duplex: "half",
      redirect: "manual",
      signal: request.signal,
    };
    const response = await fetch(target, options);
    if (response.ok && request.method === "POST" && pathname === "/api/v1/uploads") {
      const uploads: { file_id: number; upload_url: string }[] = await response.json();
      return Response.json(
        uploads.map((upload) => ({ ...upload, upload_url: browserStorageUrl(upload.upload_url) })),
        { status: response.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (
      response.ok &&
      request.method === "GET" &&
      /^\/api\/v1\/workspace\/documents\/[^/]+\/download$/.test(pathname)
    ) {
      const download: { url: string } = await response.json();
      return Response.json(
        { ...download, url: browserStorageUrl(download.url) },
        {
          status: response.status,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const forwardedHeaders = new Headers();
    for (const name of responseHeaders) {
      const value = response.headers.get(name);
      if (value !== null) forwardedHeaders.set(name, value);
    }
    const location = response.headers.get("location");
    if (location) {
      const redirect = new URL(location, target);
      if (redirect.origin === target.origin && redirect.pathname.startsWith("/api/")) {
        forwardedHeaders.set("location", `${redirect.pathname}${redirect.search}`);
      }
    }
    return new Response(response.body, { status: response.status, headers: forwardedHeaders });
  } catch {
    return Response.json({ message: "API 서버에 연결하지 못했습니다." }, { status: 502 });
  }
};

export const loader = proxyApi;
export const action = proxyApi;
