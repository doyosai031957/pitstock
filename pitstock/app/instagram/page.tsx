"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LoaderIcon, VideoIcon, DownloadIcon, CopyIcon, CheckIcon } from "lucide-react";

export default function InstagramPage() {
  const [loading, setLoading] = useState(false);
  const [videoData, setVideoData] = useState<{
    videoBase64: string;
    script: string;
    caption?: string;
    durationSec: number;
    hasBgImage?: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError("");
    setVideoData(null);
    try {
      const res = await fetch("/api/generate-video", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "영상 생성에 실패했습니다.");
      } else {
        setVideoData(data);
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!videoData) return;
    const link = document.createElement("a");
    link.href = `data:video/mp4;base64,${videoData.videoBase64}`;
    link.download = `pitstock-briefing-${new Date().toISOString().split("T")[0]}.mp4`;
    link.click();
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="text-xl font-bold tracking-tight mb-8">
        인스타 자동업로드 테스트
      </h1>

      <div className="flex flex-col gap-6">
        {/* 생성 버튼 */}
        <div className="flex items-center gap-3">
          <Button
            className="rounded-full"
            size="lg"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <LoaderIcon className="size-5 mr-2 animate-spin" />
            ) : (
              <VideoIcon className="size-5 mr-2" />
            )}
            {loading ? "영상 생성 중..." : "테스트 영상 생성"}
          </Button>
          {videoData && (
            <Button
              className="rounded-full"
              size="lg"
              variant="outline"
              onClick={handleDownload}
            >
              <DownloadIcon className="size-5 mr-2" />
              다운로드
            </Button>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {loading && (
          <p className="text-sm text-foreground/50">
            시장 데이터 + 뉴스 수집 → 스크립트 생성 → TTS → 영상 합성 중... 1~2분 소요됩니다.
          </p>
        )}

        {/* 결과 영역 */}
        {videoData && (
          <div className="flex flex-col gap-6">
            {/* 상단: 영상 + 캡션 (나란히) */}
            <div className="flex gap-6 items-start">
              {/* 영상 */}
              <div className="flex flex-col gap-2 shrink-0">
                <div className="rounded-xl border border-foreground/10 overflow-hidden" style={{ width: 320 }}>
                  <video
                    controls
                    className="w-full"
                    src={`data:video/mp4;base64,${videoData.videoBase64}`}
                  />
                </div>
                <p className="text-xs text-foreground/40">
                  {videoData.durationSec.toFixed(1)}초 | 1080x1920
                  {videoData.hasBgImage ? " | 고정 배경" : " | 단색 배경"}
                </p>
              </div>

              {/* 인스타 캡션 — 영상 옆 */}
              {videoData.caption && (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs font-medium text-foreground/50">인스타그램 캡션</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(videoData.caption!);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                    >
                      {copied ? (
                        <CheckIcon className="size-3 mr-1" />
                      ) : (
                        <CopyIcon className="size-3 mr-1" />
                      )}
                      {copied ? "복사됨" : "복사"}
                    </Button>
                  </div>
                  <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4 max-h-[570px] overflow-y-auto">
                    <p className="text-sm text-foreground/70 whitespace-pre-wrap leading-relaxed">
                      {videoData.caption}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 하단: TTS 스크립트 (전체 너비) */}
            <div>
              <p className="text-xs font-medium text-foreground/50 mb-2">TTS 스크립트</p>
              <div className="rounded-lg border border-foreground/10 p-4 max-h-[300px] overflow-y-auto">
                <p className="text-sm text-foreground/70 whitespace-pre-wrap leading-relaxed">
                  {videoData.script}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 파이프라인 상태 */}
        <div className="mt-4 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-5 max-w-lg">
          <p className="text-xs font-medium text-foreground/50 mb-3">파이프라인 상태</p>
          <div className="space-y-2 text-xs text-foreground/40">
            <p>1. 경제 뉴스 수집 — Naver API + 시장 데이터 — KIS API</p>
            <p>2. 스크립트 생성 — Claude API (2000~2500자)</p>
            <p>3. TTS 음성 — Naver Clova</p>
            <p>4. 자막 타이밍 — 글자수 비율 추정</p>
            <p>5. 배경 — 고정 이미지 (public/video-bg.png)</p>
            <p>6. 영상 합성 — FFmpeg (배경 + 날짜 + 자막)</p>
            <p className="text-foreground/30">7. 인스타 업로드 — 미구현</p>
          </div>
        </div>
      </div>
    </main>
  );
}
