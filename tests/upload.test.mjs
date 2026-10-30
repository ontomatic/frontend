import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import axios, { AxiosError } from "axios";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true, hmr: false },
});
after(() => server.close());

const { getAccessToken, login, logout } = await server.ssrLoadModule("/app/lib/api/auth.ts");
const { uploadFiles } = await server.ssrLoadModule("/app/lib/api/file.ts");
const { default: apiClient, getErrorMessage } = await server.ssrLoadModule("/app/lib/api/client.ts");
const originalApiAdapter = apiClient.defaults.adapter;
const originalStorageAdapter = axios.defaults.adapter;
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
let requests;
let failStorage;
let failCompletion;
let cookieHeader;
let cookieWrites;

const response = (config, data, status = 200) => {
  return { config, data, status, statusText: "", headers: {} };
};

beforeEach(() => {
  requests = [];
  failStorage = false;
  failCompletion = false;
  cookieHeader = "accessToken=access-token";
  cookieWrites = [];
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      location: { protocol: "http:" },
      get cookie() {
        return cookieHeader;
      },
      set cookie(value) {
        cookieWrites.push(value);
      },
    },
  });
  apiClient.defaults.adapter = async (config) => {
    requests.push(config);
    if (config.url === "/api/v1/auth/login") return response(config, { accessToken: "access-token" });
    if (config.url === "/api/v1/uploads") {
      const { files } = JSON.parse(config.data);
      return response(
        config,
        files.map((_, index) => ({
          file_id: index + 1,
          upload_url: `https://storage.example/${index + 1}?signature=abc`,
        })),
      );
    }
    if (failCompletion && config.url === "/api/v1/uploads/1/complete") {
      throw new AxiosError("Server error", "ERR_BAD_RESPONSE", config, undefined, response(config, {}, 500));
    }
    return response(config, undefined, 204);
  };
  axios.defaults.adapter = async (config) => {
    requests.push(config);
    if (failStorage && config.url.includes("/1?")) {
      throw new AxiosError("Forbidden", "ERR_BAD_REQUEST", config, undefined, response(config, "AccessDenied", 403));
    }
    return response(config, "");
  };
});

afterEach(() => {
  apiClient.defaults.adapter = originalApiAdapter;
  axios.defaults.adapter = originalStorageAdapter;
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
  else delete globalThis.document;
});

await test("logs in with the backend contract and saves a session cookie", async () => {
  assert.equal(await login({ emp_id: "employee", password: "password" }), "access-token");
  assert.equal(requests[0].url, "/api/v1/auth/login");
  assert.deepEqual(JSON.parse(requests[0].data), { emp_id: "employee", password: "password" });
  assert.deepEqual(cookieWrites, ["accessToken=access-token; Path=/; SameSite=Lax"]);
});

await test("encodes the token and sets Secure on HTTPS", async () => {
  document.location.protocol = "https:";
  apiClient.defaults.adapter = async (config) => response(config, { accessToken: "token=with;%characters" });
  await login({ emp_id: "employee", password: "password" });
  assert.equal(cookieWrites.length, 1);
  assert.deepEqual(
    new Set(cookieWrites[0].split("; ")),
    new Set(["accessToken=token%3Dwith%3B%25characters", "Path=/", "SameSite=Lax", "Secure"]),
  );
});

await test("reads only the accessToken cookie and handles missing values", () => {
  cookieHeader = "otherAccessToken=wrong; accessToken=token%3Dwith%3B%25characters; other=value";
  assert.equal(getAccessToken(), "token=with;%characters");
  for (const value of ["", "otherAccessToken=wrong", "accessToken="]) {
    cookieHeader = value;
    assert.equal(getAccessToken(), null);
  }
});

await test("keeps token values as strings without JSON parsing", () => {
  for (const token of ["123", "true", "%invalid"]) {
    cookieHeader = `accessToken=${token}`;
    assert.equal(getAccessToken(), token);
  }
});

await test("can read the token during SSR without a document", () => {
  delete globalThis.document;
  assert.equal(getAccessToken(), null);
});

await test("deletes the accessToken cookie at the same path on logout", () => {
  logout();
  assert.equal(cookieWrites.length, 1);
  const attributes = cookieWrites[0].split("; ");
  for (const attribute of ["accessToken=", "Path=/", "Max-Age=0", "SameSite=Lax"]) {
    assert.ok(attributes.includes(attribute));
  }
  const expires = attributes.find((attribute) => attribute.startsWith("Expires="));
  assert.ok(expires);
  assert.ok(new Date(expires.slice("Expires=".length)) < new Date());
});

await test("does not change the cookie when login fails", async () => {
  cookieHeader = "accessToken=existing-token";
  apiClient.defaults.adapter = async () => {
    throw new Error("Unauthorized");
  };
  await assert.rejects(login({ emp_id: "employee", password: "wrong" }), /Unauthorized/);
  assert.equal(cookieWrites.length, 0);
  assert.equal(getAccessToken(), "existing-token");
});

await test("reads the current cookie for every API request", async () => {
  cookieHeader = "accessToken=first%3Dtoken";
  await apiClient.get("/api/v1/auth/me");
  cookieHeader = "accessToken=second-token";
  await apiClient.get("/api/v1/auth/me");

  assert.deepEqual(
    requests.map(({ headers }) => headers.get("Authorization")),
    ["Bearer first=token", "Bearer second-token"],
  );
});

await test("omits authorization without a cookie, including SSR", async () => {
  for (const value of ["", "accessToken="]) {
    cookieHeader = value;
    await apiClient.get("/api/v1/auth/me", { headers: { Authorization: "Bearer stale-token" } });
  }
  delete globalThis.document;
  await apiClient.get("/api/v1/auth/me");

  assert.equal(requests.length, 3);
  assert.ok(requests.every(({ headers }) => headers.get("Authorization") === undefined));
});

await test("uploads raw files, preserves MIME types, and only authenticates API requests", async () => {
  const files = [new File(["name\nAda"], "report.csv", { type: "text/csv" }), new File(["data"], "report.XLSX")];
  const results = await uploadFiles(files);

  assert.deepEqual(results, [
    { fileId: 1, filename: "report.csv" },
    { fileId: 2, filename: "report.XLSX" },
  ]);
  assert.deepEqual(
    requests.map(({ method, url }) => [method, url]),
    [
      ["post", "/api/v1/uploads"],
      ["put", "https://storage.example/1?signature=abc"],
      ["put", "https://storage.example/2?signature=abc"],
      ["post", "/api/v1/uploads/1/complete"],
      ["post", "/api/v1/uploads/2/complete"],
    ],
  );
  assert.deepEqual(JSON.parse(requests[0].data), {
    files: [
      { filename: "report.csv", content_type: "text/csv" },
      { filename: "report.XLSX", content_type: "application/octet-stream" },
    ],
  });
  for (const request of requests) {
    if (request.method === "put") {
      const fileIndex = files.indexOf(request.data);
      assert.ok(fileIndex >= 0);
      assert.equal(request.data, files[fileIndex]);
      assert.equal(request.headers.get("Content-Type"), files[fileIndex].type || "application/octet-stream");
      assert.equal(request.headers.get("Authorization"), undefined);
      assert.equal(request.timeout, 0);
    } else {
      assert.equal(request.headers.get("Authorization"), "Bearer access-token");
      if (request.url.endsWith("/complete")) assert.equal(request.timeout, 0);
    }
  }
});

await test("starts all PUTs concurrently and waits for each PUT before completing", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  axios.defaults.adapter = async (config) => {
    requests.push(config);
    await gate;
    return response(config, "");
  };

  const pending = uploadFiles([new File(["a"], "a.csv"), new File(["b"], "b.csv")]);
  try {
    await new Promise(setImmediate);
    assert.equal(requests.filter(({ method }) => method === "put").length, 2);
    assert.equal(
      requests.some(({ url }) => url.endsWith("/complete")),
      false,
    );
  } finally {
    release();
    await pending;
  }
});

await test("does not complete a failed PUT and continues with the next file", async () => {
  failStorage = true;
  const results = await uploadFiles([new File(["a"], "a.csv"), new File(["b"], "b.csv")]);

  assert.match(results[0].error, /스토리지 업로드 실패.*403/);
  assert.equal(results[1].error, undefined);
  assert.equal(
    requests.some(({ url }) => url === "/api/v1/uploads/1/complete"),
    false,
  );
  assert.equal(requests.at(-1).url, "/api/v1/uploads/2/complete");
});

await test("reports completion failure without claiming success and continues with the next file", async () => {
  failCompletion = true;
  const results = await uploadFiles([new File(["a"], "a.csv"), new File(["b"], "b.csv")]);

  assert.match(results[0].error, /완료 처리 실패.*500/);
  assert.equal(results[1].error, undefined);
});

await test("accepts the backend limits of 10 files and 255-character filenames", async () => {
  const files = Array.from({ length: 10 }, () => new File(["a"], `${"a".repeat(251)}.csv`));
  const results = await uploadFiles(files);
  assert.equal(results.length, 10);
  assert.equal(
    results.every((result) => result.error === undefined),
    true,
  );
});

await test("rejects invalid selections before issuing URLs", async () => {
  for (const files of [
    [],
    Array.from({ length: 11 }, () => new File(["a"], "a.csv")),
    [new File(["a"], "")],
    [new File(["a"], `${"a".repeat(252)}.csv`)],
    [new File(["a"], "unsupported.txt")],
  ]) {
    await assert.rejects(uploadFiles(files));
  }
  assert.equal(requests.length, 0);
});

await test("rejects incomplete or malformed URL responses before sending any files", async () => {
  for (const data of [
    [],
    [{ file_id: 1, upload_url: "invalid" }],
    [{ file_id: "1", upload_url: "https://storage.example" }],
  ]) {
    apiClient.defaults.adapter = async (config) => response(config, data);
    await assert.rejects(uploadFiles([new File(["a"], "a.csv")]), /업로드 URL 응답/);
  }
  assert.equal(requests.length, 0);
});

await test("propagates API authentication failure without attempting a storage upload", async () => {
  cookieHeader = "accessToken=expired-token";
  apiClient.defaults.adapter = async (config) => {
    throw new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, undefined, response(config, {}, 401));
  };
  await assert.rejects(uploadFiles([new File(["a"], "a.csv")]), /Unauthorized/);
  assert.equal(requests.length, 0);
});

await test("shows backend error messages and handles network errors", () => {
  const error = new AxiosError("Unauthorized", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 401,
    data: { message: "인증 정보가 올바르지 않습니다." },
  });
  assert.equal(getErrorMessage(error), "인증 정보가 올바르지 않습니다.");
  assert.match(getErrorMessage(new AxiosError("Network Error")), /서버에 연결하지 못했습니다/);
});
