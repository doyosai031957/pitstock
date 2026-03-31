"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StockPicker } from "@/components/stock-picker";
import { AudioPlayer } from "@/components/audio-player";
import { loadStocks, saveStocks } from "@/lib/actions";
import {
  TrendingUpIcon,
  RefreshCwIcon,
  PlayIcon,
  LoaderIcon,
  FileTextIcon,
} from "lucide-react";

export function HeroSection() {
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [savedStocks, setSavedStocks] = useState<string[]>([]);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingData, setBriefingData] = useState<{
    script: string;
    audioBase64: string;
    clovaAudioBase64?: string | null;
    glossary: { term: string; definition: string }[];
  } | null>(null);
  const [briefingError, setBriefingError] = useState("");
  const [economyLoading, setEconomyLoading] = useState(false);
  const [economyData, setEconomyData] = useState<{
    script: string;
    glossary: { term: string; definition: string }[];
  } | null>(null);
  const [economyError, setEconomyError] = useState("");

  useEffect(() => {
    loadStocks().then(({ stocks }) => setSavedStocks(stocks));
  }, []);

  async function handleStockSave(stocks: string[]) {
    setSavedStocks(stocks);
    setStockDialogOpen(false);
    await saveStocks(stocks);
  }

  async function handleGenerateBriefing() {
    setBriefingLoading(true);
    setBriefingError("");
    setBriefingData(null);
    try {
      const res = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stocks: savedStocks }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBriefingError(data.error || "브리핑 생성에 실패했습니다.");
      } else {
        setBriefingData(data);
      }
    } catch {
      setBriefingError("네트워크 오류가 발생했습니다.");
    } finally {
      setBriefingLoading(false);
    }
  }

  async function handleGenerateEconomy() {
    setEconomyLoading(true);
    setEconomyError("");
    setEconomyData(null);
    try {
      const res = await fetch("/api/economy-script", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setEconomyError(data.error || "스크립트 생성에 실패했습니다.");
      } else {
        setEconomyData(data);
      }
    } catch {
      setEconomyError("네트워크 오류가 발생했습니다.");
    } finally {
      setEconomyLoading(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="text-xl font-bold tracking-tight mb-8">뉴스브리핑 테스트</h1>

      <div className="flex flex-col gap-6">
        {savedStocks.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {savedStocks.map((stock) => (
                <span
                  key={stock}
                  className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/5 px-4 py-1.5 text-sm font-medium"
                >
                  <TrendingUpIcon className="size-3 text-foreground/50" />
                  {stock}
                </span>
              ))}
              <Button
                className="rounded-full"
                size="sm"
                variant="ghost"
                onClick={() => setStockDialogOpen(true)}
              >
                <RefreshCwIcon className="size-3.5 mr-1.5" />
                종목 재설정
              </Button>
            </div>

            {/* 브리핑 생성 */}
            {briefingData ? (
              <div className="flex flex-col gap-4 max-w-md">
                <div>
                  <p className="text-xs text-foreground/40 mb-1.5">Google TTS</p>
                  <AudioPlayer
                    audioBase64={briefingData.audioBase64}
                    script={briefingData.script}
                    glossary={briefingData.glossary}
                  />
                </div>
                {briefingData.clovaAudioBase64 && (
                  <div>
                    <p className="text-xs text-foreground/40 mb-1.5">Naver Clova TTS</p>
                    <AudioPlayer
                      audioBase64={briefingData.clovaAudioBase64}
                      script={briefingData.script}
                      glossary={briefingData.glossary}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div>
                <Button
                  className="rounded-full"
                  size="lg"
                  onClick={handleGenerateBriefing}
                  disabled={briefingLoading}
                >
                  {briefingLoading ? (
                    <LoaderIcon className="size-5 mr-2 animate-spin" />
                  ) : (
                    <PlayIcon className="size-5 mr-2" />
                  )}
                  {briefingLoading ? "브리핑 생성 중..." : "브리핑 생성하기"}
                </Button>
              </div>
            )}
            {briefingError && (
              <p className="text-sm text-red-500">{briefingError}</p>
            )}

            {/* 경제 이슈 스크립트 */}
            {economyData ? (
              <div className="max-w-lg rounded-xl border border-foreground/10 bg-foreground/[0.02] p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">경제 이슈 요약 스크립트</h3>
                <p className="text-sm text-foreground/70 whitespace-pre-wrap leading-relaxed">{economyData.script}</p>
                {economyData.glossary.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-foreground/10">
                    <p className="text-xs font-medium text-foreground/50 mb-2">용어 사전</p>
                    {economyData.glossary.map((item) => (
                      <p key={item.term} className="text-xs text-foreground/60">
                        <span className="font-medium text-foreground/80">{item.term}</span>: {item.definition}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <Button
                  className="rounded-full"
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateEconomy}
                  disabled={economyLoading}
                >
                  {economyLoading ? (
                    <LoaderIcon className="size-4 mr-1.5 animate-spin" />
                  ) : (
                    <FileTextIcon className="size-4 mr-1.5" />
                  )}
                  {economyLoading ? "스크립트 생성 중..." : "경제 이슈 스크립트 생성하기"}
                </Button>
              </div>
            )}
            {economyError && (
              <p className="text-sm text-red-500">{economyError}</p>
            )}
          </>
        ) : (
          <Button
            className="rounded-full w-fit"
            size="lg"
            onClick={() => setStockDialogOpen(true)}
          >
            <TrendingUpIcon className="size-4 mr-2" />
            주식 설정하기
          </Button>
        )}
      </div>

      {/* Stock Picker Dialog */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>관심 종목 설정</DialogTitle>
            <DialogDescription>
              브리핑 받을 종목을 5개 설정해주세요.
            </DialogDescription>
          </DialogHeader>
          <StockPicker
            initialStocks={savedStocks}
            onSave={handleStockSave}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
