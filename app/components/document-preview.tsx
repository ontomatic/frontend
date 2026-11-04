import { useQuery } from "@tanstack/react-query";

import type { WorkDocument } from "~/lib/api/workspace";
import { documentNames, getWorkspace } from "~/lib/api/workspace";

import Empty from "./empty";
import Modal from "./modal";
import Notice from "./notice";
import Table from "./table";

interface DocumentPreviewProps {
  document: WorkDocument;
  onClose: () => void;
}
const DocumentPreview = ({ document, onClose }: DocumentPreviewProps) => {
  const download = useQuery({
    queryKey: ["workspace", "download", document.id],
    queryFn: () => getWorkspace<{ url: string }>(`/documents/${document.id}/download`),
  });
  return (
    <Modal title={document.filename} onClose={onClose}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>{documentNames[document.kind]}</span>
          {download.data && (
            <a href={download.data.url} target="_blank" rel="noreferrer">
              원본 다운로드 ↗
            </a>
          )}
        </div>
        {download.error && <Notice error={download.error} />}
        {document.error && <Notice tone="error">{document.error}</Notice>}
        {!document.blocks.length && (
          <Empty title="텍스트 미리보기가 없습니다">도면·사진은 원본을 열어 확인하세요.</Empty>
        )}
        {document.blocks.map((block, index) => (
          <section key={index} className="border-line grid gap-3 border-t pt-4">
            <p className="text-muted text-xs">
              {block.location?.block_index
                ? `${block.location.document_number ?? "DOCX"} · 블록 ${block.location.block_index}`
                : `p${block.location?.page_number ?? 1}`}
              {block.location?.sheet_name ? ` · ${block.location.sheet_name} ${block.location.cell_range ?? ""}` : ""} ·
              블록 {index + 1}
            </p>
            {block.location?.section_title && <p className="text-sm font-semibold">{block.location.section_title}</p>}
            {block.kind === "text" ? (
              <p className="text-sm leading-7 whitespace-pre-wrap">{block.text}</p>
            ) : (
              <Table headings={["행", ...(block.rows?.[0] ?? []).map((_, i) => `열 ${i + 1}`)]}>
                {block.rows?.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    <td>{rowIndex + 1}</td>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </Table>
            )}
          </section>
        ))}
      </div>
    </Modal>
  );
};

export default DocumentPreview;
