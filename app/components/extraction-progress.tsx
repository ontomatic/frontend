import { useEffect, useState } from "react";

import type { WorkDocument } from "~/lib/api/workspace";

interface ExtractionProgressProps {
  candidates: WorkDocument["candidates"];
}
const labels = {
  queued: "추출 요청 접수 · 처리 대기",
  preparing: "문서 분석 준비 중",
  extracting: "문서 내용 분석 중",
  merging: "분석 결과 정리 중",
  completed: "추출 완료",
  failed: "추출을 완료하지 못했습니다",
};
const ExtractionProgress = ({ candidates }: ExtractionProgressProps) => {
  const [now, setNow] = useState(Date.now);
  const running = candidates.status === "extracting";
  const progress = candidates.progress;
  const startedAt = progress?.started_at;
  useEffect(() => {
    if (!running || !startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, startedAt]);
  if (!running && !progress) return null;
  const stage = progress?.stage ?? "preparing";
  const completed = progress?.completed_chunks ?? 0;
  const total = progress?.total_chunks ?? 0;
  const elapsed = startedAt ? Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000)) : 0;
  return (
    <div className="grid min-w-40 gap-1.5 text-xs" aria-label="문서 추출 진행 상황">
      <p role="status">{labels[stage]}</p>
      {total > 0 && <p>{`${completed} / ${total} 구간 완료 · ${Math.round((completed / total) * 100)}%`}</p>}
      <progress
        aria-label="문서 분석 진행률"
        max={total || 1}
        value={stage === "completed" ? total || 1 : total > 0 ? completed : running ? undefined : 0}
        className="h-2 w-full accent-orange-500"
      />
      {running && stage === "extracting" && completed < total && (
        <p className="text-muted">{completed + 1}번째 구간 분석 중</p>
      )}
      {running && startedAt && (
        <p className="text-muted">
          경과 {elapsed >= 60 ? `${Math.floor(elapsed / 60)}분 ` : ""}
          {elapsed % 60}초
        </p>
      )}
    </div>
  );
};

export default ExtractionProgress;
