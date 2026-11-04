import { useState } from "react";

import type { Evidence, WorkDocument } from "~/lib/api/workspace";
import { documentNames, sourceLocation } from "~/lib/api/workspace";

import Button from "./button";
import DocumentPreview from "./document-preview";
import Field from "./field";

interface EvidenceFieldsProps {
  value: Evidence | null;
  onChange: (value: Evidence) => void;
  documents: WorkDocument[];
  disabled?: boolean;
  original?: boolean;
}
const EvidenceFields = ({ value, onChange, documents, disabled, original = false }: EvidenceFieldsProps) => {
  const [preview, setPreview] = useState<WorkDocument | null>(null);
  const source: Evidence = value ?? {
    document_id: "",
    page: 1,
    row: "",
    original_field: "",
    original_value: "",
    original_unit: "",
  };
  const selected = documents.find((doc) => doc.id === source.document_id);
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-[minmax(0,1fr)_5rem_6rem] gap-2">
        <Field label="근거 문서">
          <select
            disabled={disabled}
            value={source.document_id}
            onChange={(event) => {
              const doc = documents.find((candidate) => candidate.id === event.target.value);
              onChange({
                ...source,
                document_id: event.target.value,
                block_index: null,
                page: doc?.blocks.some((block) => block.location?.block_index) ? null : 1,
              });
            }}
          >
            <option value="">원본 선택</option>
            {documents
              .filter((doc) => doc.status === "parsed")
              .map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {documentNames[doc.kind]} · {doc.filename}
                </option>
              ))}
          </select>
        </Field>
        <Field label="페이지">
          <input
            type="number"
            min={1}
            disabled={disabled}
            value={source.page ?? ""}
            placeholder="선택"
            onChange={(event) => onChange({ ...source, page: event.target.value ? Number(event.target.value) : null })}
          />
        </Field>
        <Field label="행·범위">
          <input
            placeholder="예: 2, A2:D2"
            disabled={disabled}
            value={source.row}
            onChange={(event) => onChange({ ...source, row: event.target.value })}
          />
        </Field>
      </div>
      {selected?.blocks.some((block) => block.location?.block_index) && (
        <Field label="DOCX 소제목·문단/표 블록">
          <select
            disabled={disabled}
            value={source.block_index ?? ""}
            onChange={(event) => onChange({ ...source, block_index: Number(event.target.value) || null, page: null })}
          >
            <option value="">원문 블록 선택</option>
            {selected.blocks.map((block) => (
              <option key={block.location.block_index} value={block.location.block_index}>
                {block.location.document_number ?? "문서"} · 블록 {block.location.block_index} ·{" "}
                {block.kind === "table" ? "표" : "문단"} · {block.location.section_title ?? block.text?.slice(0, 40)}
              </option>
            ))}
          </select>
        </Field>
      )}
      {original && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="원문 항목명">
            <input
              disabled={disabled}
              value={source.original_field ?? ""}
              onChange={(event) => onChange({ ...source, original_field: event.target.value })}
            />
          </Field>
          <Field label="원문값">
            <input
              disabled={disabled}
              value={source.original_value ?? ""}
              onChange={(event) => onChange({ ...source, original_value: event.target.value })}
            />
          </Field>
          <Field label="원문 단위">
            <input
              disabled={disabled}
              value={source.original_unit ?? ""}
              onChange={(event) => onChange({ ...source, original_unit: event.target.value })}
            />
          </Field>
        </div>
      )}
      {selected && (
        <Button variant="ghost" className="text-accent justify-self-start px-0" onClick={() => setPreview(selected)}>
          원문 대조 · {sourceLocation(source)} / {source.row || "행 미확인"} ↗
        </Button>
      )}
      {preview && <DocumentPreview document={preview} onClose={() => setPreview(null)} />}
    </div>
  );
};

export default EvidenceFields;
