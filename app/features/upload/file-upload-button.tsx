import { useRef } from "react";

export const FileUploadButton = ({
  isPending,
  onUpload,
}: {
  isPending: boolean;
  onUpload: (files: File[]) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        accept=".csv,.docx,.pdf,.xlsx"
        disabled={isPending}
        hidden
        multiple
        type="file"
        onChange={({ currentTarget }) => {
          const files = Array.from(currentTarget.files ?? []);
          currentTarget.value = "";
          if (files.length > 0) onUpload(files);
        }}
      />
      <button
        aria-describedby="upload-help"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {isPending ? "업로드 및 문서 처리 중…" : "파일 업로드"}
      </button>
    </>
  );
};
