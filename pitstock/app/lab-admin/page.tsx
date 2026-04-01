"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  LoaderIcon,
  VideoIcon,
  DownloadIcon,
  CopyIcon,
  CheckIcon,
  RefreshCwIcon,
  PlayIcon,
  CalendarIcon,
  MicIcon,
} from "lucide-react";

type VideoMeta = {
  date: string;
  script: string;
  caption: string;
  durationSec: number;
  generatedAt: string;
  fileSizeMB: string | null;
};

type BriefingMeta = {
  date: string;
  status: string;
  generatedAt: string;
  stocks: string[];
  failed: string[];
  commonScript: string;
};

type Tab = "videos" | "briefings" | "manual";

export default function LabAdminPage() {
  const [tab, setTab] = useState<Tab>("videos");
  const [videos, setVideos] = useState<VideoMeta[]>([]);
  const [briefings, setBriefings] = useState<BriefingMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);

  // 수동 생성 상태
  const [manualLoading, setManualLoading] = useState(false);
  const [manualVideo, setManualVideo] = useState<{
    videoBase64: string;
    script: string;
    caption?: string;
    durationSec: number;
  } | null>(null);
  const [manualError, setManualError] = useState("");
  const [copied, setCopied] = useState(false);

  // 스케줄러 트리거 상태
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [triggerResult, setTriggerResult] = useState("");

  // 영상 재생
  const [playingDate, setPlayingDate] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch("/api/lab-admin/videos");
      if (res.ok) {
        const data = await res.json();
        setVideos(data.videos);
      }
    } catch { /* ignore */ }
    setListLoading(false);
  }, []);

  const fetchBriefings = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch("/api/lab-admin/briefings");
      if (res.ok) {
        const data = await res.json();
        setBriefings(data.briefings);
      }
    } catch { /* ignore */ }
    setListLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "videos") fetchVideos();
    if (tab === "briefings") fetchBriefings();
  }, [tab, fetchVideos, fetchBriefings]);

  // 수동 생성
  async function handleManualGenerate() {
    setManualLoading(true);
    setManualError("");
    setManualVideo(null);
    try {
      const res = await fetch("/api/generate-video", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setManualError(data.error || "영상 생성 실패");
      } else {
        setManualVideo(data);
      }
    } catch {
      setManualError("네트워크 오류");
    }
    setManualLoading(false);
  }

  // 스케줄러 수동 트리거
  async function handleTriggerScheduler() {
    setTriggerLoading(true);
    setTriggerResult("");
    try {
      const res = await fetch("/api/cron/generate-video");
      const data = await res.json();
      if (res.ok) {
        setTriggerResult(`생성 완료: ${data.date} (${data.durationSec?.toFixed(1)}초, ${data.scriptLength}자)`);
        fetchVideos();
      } else {
        setTriggerResult(`오류: ${data.error}`);
      }
    } catch {
      setTriggerResult("네트워크 오류");
    }
    setTriggerLoading(false);
  }

  function handleDownload(videoBase64?: string) {
    if (!videoBase64) return;
    const link = document.createElement("a");
    link.href = `data:video/mp4;base64,${videoBase64}`;
    link.download = `pitstock-${new Date().toISOString().split("T")[0]}.mp4`;
    link.click();
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "videos", label: "영상 내역", icon: <VideoIcon className="size-4" /> },
    { key: "briefings", label: "브리핑 내역", icon: <MicIcon className="size-4" /> },
    { key: "manual", label: "수동 생성", icon: <PlayIcon className="size-4" /> },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="text-xl font-bold tracking-tight mb-2">Lab Admin</h1>
      <p className="text-sm text-foreground/50 mb-8">스케줄러 생성 내역 조회 및 수동 테스트</p>

      {/* 탭 */}
      <div className="flex gap-1 mb-8 border-b border-foreground/10">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "border-foreground text-foreground"
                : "border-transparent text-foreground/40 hover:text-foreground/60"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* 영상 내역 탭 */}
      {tab === "videos" && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <Button variant="outline" size="sm" onClick={fetchVideos} disabled={listLoading}>
              <RefreshCwIcon className={`size-4 mr-1 ${listLoading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <span className="text-xs text-foreground/40">{videos.length}건</span>
          </div>

          {videos.length === 0 ? (
            <p className="text-sm text-foreground/40">생성된 영상이 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {videos.map((v) => (
                <div
                  key={v.date}
                  className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-5"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="size-4 text-foreground/40" />
                        <span className="font-medium">{v.date}</span>
                      </div>
                      <p className="text-xs text-foreground/40 mt-1">
                        {v.durationSec?.toFixed(1)}초 | {v.fileSizeMB}MB |{" "}
                        {new Date(v.generatedAt).toLocaleString("ko-KR")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPlayingDate(playingDate === v.date ? null : v.date)}
                      >
                        <PlayIcon className="size-3 mr-1" />
                        {playingDate === v.date ? "닫기" : "재생"}
                      </Button>
                      <a
                        href={`/api/lab-admin/videos?date=${v.date}`}
                        download={`pitstock-${v.date}.mp4`}
                      >
                        <Button variant="outline" size="sm">
                          <DownloadIcon className="size-3 mr-1" />
                          다운로드
                        </Button>
                      </a>
                    </div>
                  </div>

                  {playingDate === v.date && (
                    <div className="mb-3 rounded-lg overflow-hidden border border-foreground/10" style={{ maxWidth: 360 }}>
                      <video
                        controls
                        autoPlay
                        className="w-full"
                        src={`/api/lab-admin/videos?date=${v.date}`}
                      />
                    </div>
                  )}

                  {v.caption && (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-foreground/50 mb-1">캡션</p>
                      <p className="text-xs text-foreground/60 whitespace-pre-wrap line-clamp-3">
                        {v.caption}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-medium text-foreground/50 mb-1">
                      스크립트 ({v.script?.length ?? 0}자)
                    </p>
                    <p className="text-xs text-foreground/60 whitespace-pre-wrap line-clamp-3">
                      {v.script}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 브리핑 내역 탭 */}
      {tab === "briefings" && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <Button variant="outline" size="sm" onClick={fetchBriefings} disabled={listLoading}>
              <RefreshCwIcon className={`size-4 mr-1 ${listLoading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <span className="text-xs text-foreground/40">{briefings.length}건</span>
          </div>

          {briefings.length === 0 ? (
            <p className="text-sm text-foreground/40">생성된 브리핑이 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {briefings.map((b) => (
                <div
                  key={b.date}
                  className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-5"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <CalendarIcon className="size-4 text-foreground/40" />
                    <span className="font-medium">{b.date}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        b.status === "complete"
                          ? "bg-green-500/10 text-green-500"
                          : "bg-yellow-500/10 text-yellow-500"
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/40 mb-2">
                    {new Date(b.generatedAt).toLocaleString("ko-KR")} | 종목 {b.stocks.length}개
                    {b.failed.length > 0 && ` | 실패 ${b.failed.length}개`}
                  </p>
                  {b.stocks.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {b.stocks.map((s) => (
                        <span
                          key={s}
                          className="text-xs px-2 py-0.5 rounded-full bg-foreground/5 text-foreground/60"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {b.commonScript && (
                    <div>
                      <p className="text-xs font-medium text-foreground/50 mb-1">공통 스크립트</p>
                      <p className="text-xs text-foreground/60 whitespace-pre-wrap line-clamp-3">
                        {b.commonScript}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 수동 생성 탭 */}
      {tab === "manual" && (
        <div className="space-y-6">
          {/* 수동 영상 생성 */}
          <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-5">
            <p className="text-sm font-medium mb-3">수동 영상 생성 (필터 없이 최신 뉴스)</p>
            <div className="flex items-center gap-3">
              <Button onClick={handleManualGenerate} disabled={manualLoading}>
                {manualLoading ? (
                  <LoaderIcon className="size-4 mr-2 animate-spin" />
                ) : (
                  <VideoIcon className="size-4 mr-2" />
                )}
                {manualLoading ? "생성 중..." : "영상 생성"}
              </Button>
              {manualVideo && (
                <Button variant="outline" onClick={() => handleDownload(manualVideo.videoBase64)}>
                  <DownloadIcon className="size-4 mr-2" />
                  다운로드
                </Button>
              )}
            </div>
            {manualLoading && (
              <p className="text-xs text-foreground/40 mt-2">
                뉴스 수집 → 스크립트 생성 → TTS → 영상 합성 중... 1~2분 소요
              </p>
            )}
            {manualError && <p className="text-xs text-red-500 mt-2">{manualError}</p>}
          </div>

          {/* 수동 생성 결과 */}
          {manualVideo && (
            <div className="flex gap-6 items-start">
              <div className="shrink-0">
                <div className="rounded-xl border border-foreground/10 overflow-hidden" style={{ width: 320 }}>
                  <video
                    controls
                    className="w-full"
                    src={`data:video/mp4;base64,${manualVideo.videoBase64}`}
                  />
                </div>
                <p className="text-xs text-foreground/40 mt-1">
                  {manualVideo.durationSec.toFixed(1)}초 | 1080x1920
                </p>
              </div>
              {manualVideo.caption && (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs font-medium text-foreground/50">캡션</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(manualVideo.caption!);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                    >
                      {copied ? <CheckIcon className="size-3 mr-1" /> : <CopyIcon className="size-3 mr-1" />}
                      {copied ? "복사됨" : "복사"}
                    </Button>
                  </div>
                  <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4 max-h-[400px] overflow-y-auto">
                    <p className="text-sm text-foreground/70 whitespace-pre-wrap">{manualVideo.caption}</p>
                  </div>
                  <div className="mt-4">
                    <p className="text-xs font-medium text-foreground/50 mb-1">스크립트</p>
                    <div className="rounded-lg border border-foreground/10 p-4 max-h-[200px] overflow-y-auto">
                      <p className="text-sm text-foreground/70 whitespace-pre-wrap">{manualVideo.script}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 스케줄러 수동 트리거 */}
          <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-5">
            <p className="text-sm font-medium mb-1">스케줄러 수동 트리거</p>
            <p className="text-xs text-foreground/40 mb-3">
              어제 07:00 ~ 오늘 07:00 뉴스 필터 적용 + 결과 저장
            </p>
            <Button variant="outline" onClick={handleTriggerScheduler} disabled={triggerLoading}>
              {triggerLoading ? (
                <LoaderIcon className="size-4 mr-2 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-4 mr-2" />
              )}
              {triggerLoading ? "실행 중..." : "스케줄러 실행"}
            </Button>
            {triggerResult && (
              <p className="text-xs text-foreground/60 mt-2">{triggerResult}</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
