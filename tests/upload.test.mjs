import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("..", import.meta.url)),
  resolve: { tsconfigPaths: true },
  define: { "import.meta.env.VITE_API_BASE_URL": JSON.stringify("https://api.example.test") },
  server: { middlewareMode: true, hmr: false },
});
after(() => server.close());

const { getAccessToken, login, logout } = await server.ssrLoadModule("/app/lib/api/auth.ts");
const { uploadFiles } = await server.ssrLoadModule("/app/lib/api/file.ts");
const { default: apiClient, getErrorMessage } = await server.ssrLoadModule("/app/lib/api/client.ts");
const { clientLoader } = await server.ssrLoadModule("/app/routes/need-auth-layout.tsx");
const { default: FileUploadButton } = await server.ssrLoadModule("/app/features/upload/file-upload-button.tsx");
const { default: DocumentUpload } = await server.ssrLoadModule("/app/features/upload/document-upload.tsx");
const { default: ExtractionProgress } = await server.ssrLoadModule("/app/components/extraction-progress.tsx");
const { default: EvidenceFields } = await server.ssrLoadModule("/app/components/evidence-fields.tsx");
const { default: BomGraph } = await server.ssrLoadModule("/app/components/bom-graph.tsx");
const {
  getNextTarget,
  documentNames,
  kindsByDepartment,
  inspectionKinds,
  useWorkspaceAction,
  documentPollInterval,
  mergeDocumentCandidate,
} = await server.ssrLoadModule("/app/lib/api/workspace.ts");
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

await test("uses the configured API base URL for requests", () => {
  assert.equal(apiClient.getUri({ url: "/api/v1/auth/me" }), "https://api.example.test/api/v1/auth/me");
});

await test("uses a bounded timeout for extraction registration and other workspace requests", async () => {
  const queryClient = new QueryClient();
  let action;
  const CaptureAction = () => {
    action = useWorkspaceAction();
    return null;
  };
  renderToStaticMarkup(createElement(QueryClientProvider, { client: queryClient }, createElement(CaptureAction)));
  try {
    for (const path of ["/documents/doc/extract", "/specifications"]) {
      await action.mutateAsync({ path, body: {} });
    }
    assert.deepEqual(
      requests.map(({ timeout }) => timeout),
      [180_000, 180_000],
    );
  } finally {
    queryClient.clear();
  }
});

await test("polls only while document extraction is running", () => {
  for (const status of ["ready", "error", "not_extracted"])
    assert.equal(documentPollInterval({ state: { data: [{ candidates: { status } }] } }), false);
  assert.equal(documentPollInterval({ state: {} }), false);
  assert.equal(documentPollInterval({ state: { data: [] } }), false);
  assert.equal(
    documentPollInterval({
      state: { data: [{ candidates: { status: "ready" } }, { candidates: { status: "extracting" } }] },
    }),
    1500,
  );
});

const candidateItem = (key, code, name, attributes = [], version = 1) => ({
  key,
  code,
  name,
  version,
  kind: code === "CAM" ? "product" : "component",
  unit: "개",
  aliases: [],
  confirmed: false,
  attributes,
});
const candidateAttribute = (document_id, field, value) => ({
  field,
  value,
  unit: "mm",
  required: true,
  confirmed: false,
  source: { document_id, block_index: 1, page: null, row: "2" },
});
const specificationCandidates = () => {
  const initial = {
    root: "CAM@1",
    items: [candidateItem("CAM@1", "CAM", "카메라", [candidateAttribute("manual", "mass", 3)])],
    relations: [],
  };
  const detail = {
    id: "detail",
    kind: "product_detail",
    candidates: {
      status: "ready",
      data: {
        root: "CAM@1",
        items: [
          candidateItem("CAM@1", "CAM", "카메라", [candidateAttribute("detail", "resolution", 24)]),
          candidateItem("렌즈@1", "", "렌즈", [candidateAttribute("detail", "length", 8)]),
        ],
        relations: [],
      },
    },
  };
  const bom = {
    id: "bom",
    kind: "bom_transfer",
    candidates: {
      status: "ready",
      data: {
        root: "bom-root",
        items: [
          candidateItem("bom-root", "CAM", "카메라"),
          candidateItem("LENS@1", "LENS", "렌즈", [candidateAttribute("bom", "material", "유리")]),
        ],
        relations: [
          {
            parent: "bom-root",
            child: "LENS@1",
            quantity: 2,
            condition: "common",
            confirmed: false,
            source: { document_id: "bom", block_index: 2, page: null, row: "3" },
          },
        ],
      },
    },
  };
  return { initial, detail, bom };
};

await test("specification and BOM candidates preserve each other in either application order", () => {
  const { initial, detail, bom } = specificationCandidates();
  const originals = structuredClone({ initial, detail, bom });
  for (const documents of [
    [detail, bom],
    [bom, detail],
  ]) {
    const graph = documents.reduce(mergeDocumentCandidate, initial);
    assert.equal(graph.root, initial.root);
    assert.equal(graph.items.length, 2);
    const root = graph.items.find((item) => item.key === graph.root);
    assert.deepEqual(
      root.attributes.map(({ field, value }) => [field, value]),
      [
        ["mass", 3],
        ["resolution", 24],
      ],
    );
    const lens = graph.items.find((item) => item.code === "LENS");
    assert.deepEqual(
      lens.attributes.map(({ field, value }) => [field, value]).sort(([a], [b]) => a.localeCompare(b)),
      [
        ["length", 8],
        ["material", "유리"],
      ],
    );
    assert.deepEqual(graph.relations, [{ ...bom.candidates.data.relations[0], parent: graph.root, child: lens.key }]);
    assert.deepEqual(mergeDocumentCandidate(graph, detail), graph);
    assert.deepEqual(mergeDocumentCandidate(graph, bom), graph);
  }
  assert.deepEqual({ initial, detail, bom }, originals);
});

await test("reapplying a document updates only its facts and preserves other confirmed evidence", () => {
  const { initial, detail, bom } = specificationCandidates();
  const graph = structuredClone([detail, bom].reduce(mergeDocumentCandidate, initial));
  const lens = graph.items.find((item) => item.code === "LENS");
  lens.confirmed = true;
  lens.attributes.forEach((attribute) => {
    attribute.confirmed = true;
  });
  graph.relations[0].confirmed = true;
  const changedDetail = structuredClone(detail);
  changedDetail.candidates.data.items[0].attributes = [];
  changedDetail.candidates.data.items[1].attributes[0].value = 9;
  const result = mergeDocumentCandidate(graph, changedDetail);
  assert.deepEqual(result.relations, graph.relations);
  const updatedLens = result.items.find((item) => item.code === "LENS");
  assert.equal(updatedLens.confirmed, true);
  assert.equal(updatedLens.attributes.find((attribute) => attribute.field === "length").value, 9);
  assert.equal(updatedLens.attributes.find((attribute) => attribute.field === "length").confirmed, false);
  assert.deepEqual(
    updatedLens.attributes.find((attribute) => attribute.field === "material"),
    lens.attributes[1],
  );
  assert.deepEqual(result.items.find((item) => item.key === result.root).attributes, initial.items[0].attributes);
  const changedBom = structuredClone(bom);
  changedBom.candidates.data.relations[0].quantity = 4;
  const withBom = mergeDocumentCandidate(result, changedBom);
  assert.equal(withBom.relations[0].quantity, 4);
  assert.deepEqual(
    withBom.items.find((item) => item.code === "LENS").attributes.find((attribute) => attribute.field === "length"),
    updatedLens.attributes.find((attribute) => attribute.field === "length"),
  );
});

await test("reapplying a hierarchical BOM replaces its flat edges and preserves parent identities", () => {
  const { initial, detail, bom } = specificationCandidates();
  const glass = candidateItem("GLASS@1", "GLASS", "광학 유리");
  glass.kind = "material";
  bom.candidates.data.items.push(glass);
  const flatEdge = { ...bom.candidates.data.relations[0], child: glass.key, quantity: 14 };
  bom.candidates.data.relations.push(flatEdge);
  const current = [detail, bom].reduce(mergeDocumentCandidate, initial);
  const hierarchical = structuredClone(bom);
  hierarchical.candidates.data.relations[1].parent = bom.candidates.data.items[1].key;
  const updated = mergeDocumentCandidate(current, hierarchical);
  const lens = updated.items.find((item) => item.code === "LENS");
  assert.deepEqual(
    updated.relations.map(({ parent, child }) => [parent, child]),
    [
      [updated.root, lens.key],
      [lens.key, glass.key],
    ],
  );
  assert.deepEqual(lens.attributes, current.items.find((item) => item.code === "LENS").attributes);
  assert.deepEqual(mergeDocumentCandidate(updated, hierarchical), updated);
});

await test("BOM material descriptions merge with specification names in either application order", () => {
  const { initial, detail, bom } = specificationCandidates();
  const incoming = bom.candidates.data.items[1];
  incoming.name = "렌즈 (다층 코팅 광학 유리)";
  incoming.aliases = ["렌즈"];
  incoming.attributes = [];
  incoming.kind = "material";
  detail.candidates.data.items[1].kind = "assembly";
  for (const documents of [
    [detail, bom],
    [bom, detail],
  ]) {
    const graph = documents.reduce(mergeDocumentCandidate, initial);
    assert.equal(graph.items.length, 2);
    const lens = graph.items.find((item) => item.code === "LENS");
    assert.equal(lens.kind, "material");
    assert.equal(lens.attributes[0].value, 8);
    assert.equal(lens.attributes[0].source.document_id, detail.id);
    assert.ok([lens.name, ...lens.aliases].includes("렌즈 (다층 코팅 광학 유리)"));
    assert.equal(graph.relations[0].child, lens.key);
    assert.deepEqual(mergeDocumentCandidate(graph, bom), graph);
  }
  const graph = [detail, bom].reduce(mergeDocumentCandidate, initial);
  graph.items.find((item) => item.code === "LENS").confirmed = true;
  const correctedBom = structuredClone(bom);
  correctedBom.candidates.data.items[1].kind = "component";
  const corrected = mergeDocumentCandidate(graph, correctedBom).items.find((item) => item.code === "LENS");
  assert.equal(corrected.kind, "component");
  assert.equal(corrected.confirmed, false);
});

await test("candidate matching keeps different codes and versions separate and preserves conflicting evidence", () => {
  const { initial, detail, bom } = specificationCandidates();
  const graph = mergeDocumentCandidate(initial, bom);
  graph.items.push(candidateItem("LENS@2", "LENS", "렌즈", [], 2));
  const coded = structuredClone(detail);
  coded.candidates.data.items[1] = candidateItem("other-lens-key", "LENS", "렌즈", [
    candidateAttribute("detail", "material", "플라스틱"),
  ]);
  const result = mergeDocumentCandidate(graph, coded);
  assert.equal(result.items.length, 3);
  assert.deepEqual(
    result.items.find((item) => item.key === "LENS@1").attributes.map(({ value }) => value),
    ["유리", "플라스틱"],
  );
  const differentCode = structuredClone(coded);
  differentCode.candidates.data.items[1].code = "OTHER";
  differentCode.candidates.data.items[1].key = "LENS@1";
  const separate = mergeDocumentCandidate(graph, differentCode);
  assert.equal(separate.items.length, 4);
  assert.equal(new Set(separate.items.map((item) => item.key)).size, 4);
  assert.equal(separate.items.find((item) => item.key === "LENS@1").code, "LENS");
  graph.items.push(candidateItem("OTHER@1", "OTHER", "렌즈"));
  const ambiguous = mergeDocumentCandidate(graph, detail);
  assert.equal(ambiguous.items.length, 5);
  assert.deepEqual(mergeDocumentCandidate(ambiguous, detail), ambiguous);
});

await test("document cards offer separate specification and BOM application actions", () => {
  const { detail, bom } = specificationCandidates();
  const queryClient = new QueryClient();
  try {
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(DocumentUpload, {
          user: { department: { code: "research_and_development" } },
          specificationId: "spec",
          documents: [detail, bom].map((doc, index) => ({
            ...doc,
            file_id: index + 1,
            filename: `${doc.id}.docx`,
            department: "research_and_development",
            scope: { target_ids: [] },
            status: "parsed",
          })),
          onCandidate: () => {},
        }),
      ),
    );
    assert.match(html, /사양 후보를 작업본에 반영/);
    assert.match(html, /BOM 후보를 작업본에 반영/);
    assert.doesNotMatch(html, /작업본 교체/);
  } finally {
    queryClient.clear();
  }
});

await test("shows background extraction status and disables repeated extraction", () => {
  const queryClient = new QueryClient();
  try {
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(DocumentUpload, {
          user: { department: { code: "research_and_development" } },
          specificationId: "spec",
          documents: [
            {
              id: "doc",
              file_id: 1,
              kind: "product_detail",
              filename: "original.csv",
              department: "research_and_development",
              specification_id: "spec",
              job_id: null,
              scope: { target_ids: [] },
              status: "parsed",
              candidates: {
                status: "extracting",
                progress: {
                  stage: "extracting",
                  completed_chunks: 2,
                  total_chunks: 4,
                  started_at: new Date().toISOString(),
                },
              },
            },
          ],
        }),
      ),
    );
    assert.match(html, /후보 추출 중/);
    assert.match(html, /2 \/ 4 구간 완료 · 50%/);
    assert.match(html, /3번째 구간 분석 중/);
    assert.match(html, /경과/);
    assert.match(html, /<progress\b[^>]*aria-label="문서 분석 진행률"/);
    assert.match(html, /<button\b[^>]*disabled=""[^>]*>추출 중…<\/button>/);
  } finally {
    queryClient.clear();
  }
});

await test("progress distinguishes unknown work, completion, and failure", () => {
  const render = (status, stage, completed_chunks = 0, total_chunks = 0) =>
    renderToStaticMarkup(
      createElement(ExtractionProgress, {
        candidates: { status, progress: { stage, completed_chunks, total_chunks } },
      }),
    );
  const queued = render("extracting", "queued");
  assert.match(queued, /처리 대기/);
  assert.doesNotMatch(queued, /%|value=/);
  const completed = render("ready", "completed", 4, 4);
  assert.match(completed, /추출 완료/);
  assert.match(completed, /4 \/ 4 구간 완료 · 100%/);
  const failed = render("error", "failed", 1, 4);
  assert.match(failed, /추출을 완료하지 못했습니다/);
  assert.match(failed, /1 \/ 4 구간 완료 · 25%/);
  assert.doesNotMatch(failed, /번째 구간 분석 중/);
  assert.match(render("error", "failed"), /value="0"/);
});

await test("offers an upload button instead of a form and disables it while uploading", () => {
  const renderButton = (isPending) =>
    renderToStaticMarkup(createElement(FileUploadButton, { isPending, onUpload: () => {} }));
  const idle = renderButton(false);
  assert.match(idle, /<button[^>]*>파일 업로드<\/button>/);
  assert.doesNotMatch(idle, /<form\b|disabled=""/);
  assert.match(renderButton(true), /<button[^>]*disabled=""[^>]*>업로드 및 문서 처리 중…<\/button>/);
});

await test("document uploads offer only the 11 approved types in their owning departments", () => {
  const expected = {
    research_and_development: ["product_detail", "bom_transfer"],
    quality_assurance: ["incoming_inspection", "inspection_module1", "inspection_module2", "inspection_final"],
    production_management: [
      "production_plan",
      "work_instruction_module1",
      "work_instruction_lens",
      "work_instruction_body",
      "work_instruction_final",
    ],
  };
  assert.deepEqual(kindsByDepartment, expected);
  assert.equal(Object.keys(documentNames).length, 11);
  for (const [department, kinds] of Object.entries(expected)) {
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(DocumentUpload, {
          user: { department: { code: department } },
          documents: [],
          ...(department === "research_and_development" ? { specificationId: "spec" } : { job: { targets: {} } }),
        }),
      ),
    );
    assert.deepEqual(
      [...html.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]),
      department === "quality_assurance" ? [] : kinds,
    );
    assert.match(html, /accept="\.pdf,\.docx,\.csv,\.xlsx"/);
    assert.doesNotMatch(html, /도면\/사진|\.png|\.jpg/);
  }
});

await test("quality upload identifies the kind and targets from the file without selections", () => {
  const targets = Object.fromEntries(
    ["material", "component", "assembly", "product"].map((kind) => [
      kind,
      {
        id: kind,
        name: `${kind} 대상`,
        kind,
        version: 1,
        quantity: 1,
        unit: "개",
        round: 1,
        plan_version: 0,
      },
    ]),
  );
  for (const targetId of Object.keys(inspectionKinds)) {
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(DocumentUpload, {
          user: { department: { code: "quality_assurance" } },
          documents: [],
          job: { targets },
          targetId,
        }),
      ),
    );
    assert.match(html, /문서 종류와 포함된 대상을 자동으로 확인/);
    assert.match(html, /aria-label="원본 파일"/);
    assert.doesNotMatch(html, /<select|type="checkbox"|문서가 포함하는 대상/);
  }
});

await test("uploaded quality reports display identified targets as read-only results", () => {
  const queryClient = new QueryClient();
  try {
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(DocumentUpload, {
          user: { department: { code: "quality_assurance" } },
          job: {
            id: "job",
            specification_id: "spec",
            targets: {
              sensor: { name: "센서 칩", version: 1, round: 2, plan_version: 3 },
              glass: { name: "보호 유리", version: 1, round: 2, plan_version: 3 },
            },
          },
          documents: [
            {
              id: "doc",
              file_id: 1,
              filename: "원본.csv",
              kind: "incoming_inspection",
              department: "quality_assurance",
              job_id: "job",
              status: "parsed",
              scope: { specification_id: "spec", target_ids: ["sensor", "glass"], round: 2, plan_version: 3 },
              candidates: { status: "ready", data: { rows: [] } },
            },
          ],
        }),
      ),
    );
    assert.match(html, /수입검사-03/);
    assert.match(html, /2개 대상 · 회차 2 · 계획 v3/);
    assert.match(html, /연결 대상 · 센서 칩 v1, 보호 유리 v1/);
    assert.doesNotMatch(html, /<select|type="checkbox"/);
  } finally {
    queryClient.clear();
  }
});

await test("prevents relabeling an existing document while allowing a different round or plan", () => {
  const cases = [
    ["research_and_development", "product_detail", {}, true],
    ["research_and_development", "bom_transfer", {}, null],
    ["quality_assurance", "incoming_inspection", {}, true],
    ["quality_assurance", "inspection_module1", {}, true],
    ["quality_assurance", "incoming_inspection", { round: 2 }, false],
    ["quality_assurance", "incoming_inspection", { plan_version: 1 }, false],
    ["quality_assurance", "incoming_inspection", { target_ids: ["target", "other"] }, false],
    ["production_management", "production_plan", { plan_version: 1 }, true],
    ["production_management", "work_instruction_module1", {}, null],
    ["production_management", "production_plan", {}, false],
  ];
  for (const [department, kind, scope, disabled] of cases) {
    const rd = department === "research_and_development";
    const queryClient = new QueryClient();
    const props = {
      user: { department: { code: department } },
      documents: [
        {
          id: "doc",
          file_id: 1,
          filename: "original.csv",
          kind,
          department,
          specification_id: "spec",
          job_id: rd ? null : "job",
          scope: { target_ids: rd ? [] : ["target"], round: 1, plan_version: 0, ...scope },
          status: "parsed",
          candidates: { status: "not_extracted" },
        },
      ],
      ...(rd
        ? { specificationId: "spec" }
        : {
            targetId: "target",
            job: {
              id: "job",
              plan_version: 0,
              targets: {
                target: {
                  id: "target",
                  kind: department === "quality_assurance" ? "material" : "component",
                  round: 1,
                  plan_version: 0,
                },
              },
            },
          }),
    };
    try {
      const html = renderToStaticMarkup(
        createElement(QueryClientProvider, { client: queryClient }, createElement(DocumentUpload, props)),
      );
      const button = html.match(/<button\b[^>]*>(?:현재 범위에 연결됨|이 원본을 자동으로 연결)<\/button>/)?.[0];
      if (disabled === null) {
        assert.equal(button, undefined, "a different upload kind must not relabel an existing original");
        continue;
      }
      assert.ok(button);
      assert.equal(button.includes('disabled=""'), disabled, JSON.stringify([department, kind, scope]));
    } finally {
      queryClient.clear();
    }
  }
  assert.equal(requests.length, 0);
});

await test("verifies authentication with the current token before loading a protected page", async () => {
  assert.equal(await clientLoader(), null);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "get");
  assert.equal(requests[0].url, "/api/v1/auth/me");
  assert.equal(requests[0].headers.get("Authorization"), "Bearer access-token");
});

await test("clears the session and redirects to login when authentication returns 401", async () => {
  apiClient.defaults.adapter = async (config) => {
    throw new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, undefined, response(config, {}, 401));
  };

  for (const value of ["", "accessToken=expired-token"]) {
    cookieHeader = value;
    await assert.rejects(
      clientLoader,
      (error) => error instanceof Response && error.status === 302 && error.headers.get("Location") === "/auth/login",
    );
  }
  assert.equal(cookieWrites.length, 2);
  assert.ok(cookieWrites.every((value) => value.split("; ").includes("Max-Age=0")));
});

await test("preserves the session and propagates authentication errors other than 401", async () => {
  for (const error of [
    new AxiosError("Server error", "ERR_BAD_RESPONSE", undefined, undefined, { status: 500 }),
    new AxiosError("Network Error", "ERR_NETWORK"),
  ]) {
    apiClient.defaults.adapter = async () => {
      throw error;
    };
    await assert.rejects(clientLoader, (received) => received === error);
  }
  assert.equal(cookieWrites.length, 0);
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
  const results = await uploadFiles(files, "product_detail");

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
    kind: "product_detail",
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

await test("quality files can be uploaded together for automatic document identification", async () => {
  const files = [new File(["data"], "수입검사.csv"), new File(["data"], "모듈검사.docx")];
  const results = await uploadFiles(files, "auto");
  assert.equal(JSON.parse(requests[0].data).kind, "auto");
  assert.deepEqual(
    results.map(({ filename, error }) => [filename, error]),
    [
      ["수입검사.csv", undefined],
      ["모듈검사.docx", undefined],
    ],
  );
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

  const pending = uploadFiles([new File(["a"], "a.csv"), new File(["b"], "b.csv")], "product_detail");
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
  const results = await uploadFiles([new File(["a"], "a.csv"), new File(["b"], "b.csv")], "product_detail");

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
  const results = await uploadFiles([new File(["a"], "a.csv"), new File(["b"], "b.csv")], "product_detail");

  assert.match(results[0].error, /완료 처리 실패.*500/);
  assert.equal(results[1].error, undefined);
});

await test("accepts the backend limits of 10 files and 255-character filenames", async () => {
  const files = Array.from({ length: 10 }, () => new File(["a"], `${"a".repeat(251)}.csv`));
  const results = await uploadFiles(files, "product_detail");
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
    [new File(["a"], "photo.png")],
  ]) {
    await assert.rejects(uploadFiles(files, "product_detail"));
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
    await assert.rejects(uploadFiles([new File(["a"], "a.csv")], "product_detail"), /업로드 URL 응답/);
  }
  assert.equal(requests.length, 0);
});

await test("propagates API authentication failure without attempting a storage upload", async () => {
  cookieHeader = "accessToken=expired-token";
  apiClient.defaults.adapter = async (config) => {
    throw new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, undefined, response(config, {}, 401));
  };
  await assert.rejects(uploadFiles([new File(["a"], "a.csv")], "product_detail"), /Unauthorized/);
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

await test("DOCX evidence selects a specific source block without inventing a page", () => {
  const document = {
    id: "doc",
    kind: "product_detail",
    filename: "reference.docx",
    status: "parsed",
    blocks: [
      {
        kind: "table",
        rows: [
          ["항목", "값"],
          ["재질", "광학 유리"],
        ],
        location: { block_index: 4, section_title: "광학 사양", document_number: "사양-01" },
      },
    ],
  };
  const html = renderToStaticMarkup(
    createElement(EvidenceFields, {
      value: { document_id: "doc", page: null, block_index: 4, row: "2" },
      documents: [document],
      disabled: true,
      onChange: () => {},
    }),
  );
  assert.match(html, /DOCX 소제목/);
  assert.match(html, /블록 4/);
  assert.doesNotMatch(html, /원문 대조 · p1/);
});

await test("BOM drawing aligns quality stages with composition columns", () => {
  const target = (id, kind, parents, children) => ({
    id,
    kind,
    parents,
    children,
    code: id,
    name: id,
    version: 1,
    quantity: 10,
    unit: "개",
    status: "waiting",
    round: 1,
    condition: "demo",
    waiting_reasons: [],
  });
  const targets = {
    root: target("root", "product", [], ["assembly"]),
    assembly: target("assembly", "assembly", ["root"], ["component"]),
    component: target("component", "component", ["assembly"], ["material"]),
    material: target("material", "material", ["component"], []),
  };
  const html = renderToStaticMarkup(createElement(BomGraph, { targets, selected: "root", onSelect: () => {} }));
  assert.doesNotMatch(html, /NaN|undefined/);
  assert.equal((html.match(/<path /g) ?? []).length, 3);
  assert.match(html, /반제품/);
  assert.match(html, /주요 부품/);
  assert.match(html, /재료/);
  assert.deepEqual(
    [...html.matchAll(/구성 깊이 (\d+)/g)].map((match) => Number(match[1])),
    [0, 1, 2],
  );
  const columns = html.split(/<p [^>]*>구성 깊이 /).slice(1);
  assert.match(columns[1], /<strong[^>]*>assembly<\/strong>/);
  assert.match(columns[1], /<strong[^>]*>component<\/strong>/);
  assert.match(columns[2], /<strong[^>]*>material<\/strong>/);
  assert.doesNotMatch(html, /구성 깊이 3/);
});

await test("module labels preserve quality-based depth without inventing production targets", () => {
  const target = (id, kind, parents, children) => ({
    id,
    name: id,
    code: id,
    kind,
    parents,
    children,
    version: 1,
    quantity: 20,
    unit: "개",
    status: "waiting",
    round: 1,
    condition: "원문",
    waiting_reasons: [],
  });
  const targets = {
    root: target("root", "product", [], ["lens", "frame", "sensor", "cap"]),
    lens: target("lens", "component", ["root"], []),
    frame: target("frame", "component", ["root"], []),
    sensor: target("sensor", "material", ["root"], []),
    cap: target("cap", "material", ["root"], []),
  };
  const groups = [
    { name: "렌즈 모듈", target_ids: ["lens"] },
    { name: "본체 모듈", target_ids: ["frame", "sensor"] },
  ];
  const original = structuredClone({ targets, groups });
  const html = renderToStaticMarkup(createElement(BomGraph, { targets, groups, selected: "lens", onSelect: () => {} }));
  assert.deepEqual(
    [...html.matchAll(/구성 깊이 (\d+)/g)].map((match) => Number(match[1])),
    [0, 1, 2],
  );
  assert.equal((html.match(/<button /g) ?? []).length, 5);
  assert.equal((html.match(/<path /g) ?? []).length, 4);
  const links = [...html.matchAll(/<title>(.*?)<\/title>/g)].map((match) => match[1]);
  assert.deepEqual(links, ["root → lens", "root → frame", "frame → sensor", "lens, frame → cap"]);
  const columns = html.split(/<p [^>]*>구성 깊이 /).slice(1);
  assert.match(columns[0], /^0 · 품질 3차/);
  assert.match(columns[1], /^1 · 품질 2차/);
  assert.match(columns[1], /<strong[^>]*>lens<\/strong>/);
  assert.match(columns[1], /렌즈 모듈/);
  assert.doesNotMatch(columns[1], /<strong[^>]*>(sensor|cap)<\/strong>/);
  assert.match(columns[2], /^2 · 품질 1차/);
  assert.match(columns[2], /<strong[^>]*>sensor<\/strong>/);
  assert.match(columns[2], /<strong[^>]*>cap<\/strong>/);
  assert.match(columns[2], /본체 모듈/);
  assert.doesNotMatch(html, /composition-group:|role="group"/);
  assert.doesNotMatch(html, /NaN|undefined/);
  assert.deepEqual({ targets, groups }, original);
});

await test("shared specification parts retain all module labels without an extra depth", () => {
  const targets = Object.fromEntries(
    ["root", "part"].map((id) => [
      id,
      {
        id,
        name: id,
        code: id,
        kind: id === "root" ? "product" : "material",
        version: 1,
        quantity: 10,
        unit: "개",
        round: 1,
        status: "waiting",
        condition: "",
        waiting_reasons: [],
        parents: id === "root" ? [] : ["root"],
        children: id === "root" ? ["part"] : [],
      },
    ]),
  );
  const groups = ["렌즈 모듈", "본체 모듈"].map((name) => ({ name, target_ids: ["part"] }));
  const html = renderToStaticMarkup(createElement(BomGraph, { targets, groups, selected: "part", onSelect: () => {} }));
  assert.equal((html.match(/<button /g) ?? []).length, 2);
  assert.equal((html.match(/<path /g) ?? []).length, 0);
  assert.match(html, /렌즈 모듈, 본체 모듈/);
  assert.match(html, /구성 깊이 2/);
  assert.doesNotMatch(html, /NaN|undefined|구성 깊이 3/);
});

await test("quality-stage connections prefer explicit BOM parents over a shared module", () => {
  const target = (id, kind, parents, children) => ({
    id,
    name: id,
    code: id,
    kind,
    parents,
    children,
    version: 1,
    quantity: 10,
    unit: "개",
    status: "waiting",
    round: 1,
    condition: "원문",
    waiting_reasons: [],
  });
  const targets = {
    root: target("root", "product", [], ["a", "b"]),
    a: target("a", "component", ["root"], ["material"]),
    b: target("b", "assembly", ["root"], []),
    material: target("material", "material", ["a"], []),
  };
  const original = structuredClone(targets);
  const html = renderToStaticMarkup(
    createElement(BomGraph, {
      targets,
      groups: [{ name: "본체 모듈", target_ids: ["a", "b", "material"] }],
      selected: "material",
      onSelect: () => {},
    }),
  );
  assert.deepEqual(
    [...html.matchAll(/<title>(.*?)<\/title>/g)].map((match) => match[1]),
    ["root → a", "root → b", "a → material"],
  );
  assert.deepEqual(targets, original);
});

await test("next actions follow department ownership and direct-input readiness", () => {
  const root = { id: "root", kind: "product", status: "waiting", waiting_reasons: ["하위 합격 대기"] };
  const material = { id: "material", kind: "material", status: "waiting", waiting_reasons: [] };
  const assembly = { id: "assembly", kind: "assembly", status: "producing", waiting_reasons: [] };
  const job = { targets: { root, material, assembly } };
  assert.equal(getNextTarget(job, "quality_assurance").id, "material");
  assert.equal(getNextTarget(job, "production_management").id, "assembly");
  material.status = "passed";
  assembly.status = "passed";
  root.status = "passed";
  assert.equal(getNextTarget(job, "quality_assurance"), undefined);
});

await test("job uploads identify targets without presenting an inventory checklist", () => {
  const inventory = {
    id: "inventory",
    name: "가공 재고",
    kind: "component",
    inventory_of: "process",
    version: 1,
    quantity: 120,
    unit: "개",
    round: 1,
    plan_version: 1,
  };
  const job = { id: "job", targets: { inventory }, plan_version: 1 };
  for (const code of ["production_management", "quality_assurance"]) {
    const queryClient = new QueryClient();
    try {
      const markup = renderToStaticMarkup(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(DocumentUpload, { user: { department: { code } }, job, targetId: inventory.id, documents: [] }),
        ),
      );
      assert.match(markup, /자동으로/);
      assert.doesNotMatch(markup, /type="checkbox"|가공 재고/);
    } finally {
      queryClient.clear();
    }
  }
});

await test("a document task keeps its requested department and never silently falls back to an unrelated upload type", () => {
  const job = { id: "job", plan_version: 1, targets: {} };
  for (const user of [
    { role: "system_admin", department: null },
    { role: "general", department: { code: "quality_assurance" } },
    { role: "general", department: { code: "production_management" } },
  ]) {
    const queryClient = new QueryClient();
    try {
      const html = renderToStaticMarkup(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(DocumentUpload, { user, job, documents: [], initialKind: "work_instruction_module1" }),
        ),
      );
      if (user.department?.code === "production_management") {
        assert.match(html, /value="work_instruction_module1" selected/);
        assert.match(html, /aria-label="원본 파일"/);
      } else {
        assert.match(html, /순서-05/);
        assert.match(html, /생산관리 담당자/);
        assert.match(html, /조회만 가능합니다/);
        assert.doesNotMatch(html, /aria-label="원본 파일"|<form|value="incoming_inspection"/);
      }
      if (user.role === "system_admin") {
        const generic = renderToStaticMarkup(
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(DocumentUpload, { user, job, documents: [] }),
          ),
        );
        assert.match(generic, /생산계획서·작업 순서는 생산관리 담당자, 검사성적서는 품질관리 담당자/);
        assert.doesNotMatch(generic, /aria-label="원본 파일"|<form/);
      }
    } finally {
      queryClient.clear();
    }
  }
});

await test("graph cards display the responsible action instead of a cryptic waiting reason", () => {
  const target = {
    id: "part",
    name: "경통",
    code: "PART",
    kind: "component",
    version: 1,
    quantity: 10,
    unit: "개",
    status: "waiting",
    round: 1,
    parents: [],
    children: [],
    condition: "원문",
    waiting_reasons: ["해당 단계 작업 순서 연결 대기"],
  };
  const html = renderToStaticMarkup(
    createElement(BomGraph, {
      targets: { part: target },
      selected: "part",
      groups: [],
      onSelect: () => {},
      actionLabels: { part: "생산관리 · 순서-05 연결하기" },
    }),
  );
  assert.match(html, /생산관리 · 순서-05 연결하기/);
  assert.doesNotMatch(html, /해당 단계 작업 순서 연결 대기/);
});
