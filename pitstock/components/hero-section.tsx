"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StockPicker } from "@/components/stock-picker";
import { LoginDialog } from "@/components/login-dialog";
import { AudioPlayer } from "@/components/audio-player";
import { getAuthState, loadStocks, saveStocks, logout } from "@/lib/actions";
import {
  Volume2Icon,
  TrendingUpIcon,
  ClockIcon,
  RefreshCwIcon,
  LogOutIcon,
  PlayIcon,
  LoaderIcon,
} from "lucide-react";

export function HeroSection() {
  const [user, setUser] = useState<{ userId: string; name: string } | null>(null);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [savedStocks, setSavedStocks] = useState<string[]>([]);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingData, setBriefingData] = useState<{
    script: string;
    audioBase64: string;
    glossary: { term: string; definition: string }[];
  } | null>(null);
  const [briefingError, setBriefingError] = useState("");

  useEffect(() => {
    getAuthState().then(async (session) => {
      if (session) {
        setUser(session);
        const { stocks } = await loadStocks();
        setSavedStocks(stocks);
      }
    });
  }, []);

  function handleCtaClick() {
    if (user) {
      setStockDialogOpen(true);
    } else {
      setLoginDialogOpen(true);
    }
  }

  async function handleLoginSuccess(loggedInUser: { userId: string; name: string }) {
    setUser(loggedInUser);
    setLoginDialogOpen(false);
    const { stocks } = await loadStocks();
    setSavedStocks(stocks);
    setStockDialogOpen(true);
  }

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

  async function handleLogout() {
    await logout();
    setUser(null);
    setSavedStocks([]);
    setBriefingData(null);
    setBriefingError("");
  }

  return (
    <section className="mx-auto w-full max-w-5xl">
      {/* Top Shades */}
      <div
        aria-hidden="true"
        className="absolute inset-0 isolate hidden overflow-hidden contain-strict lg:block"
      >
        <div className="absolute inset-0 -top-14 isolate -z-10 bg-[radial-gradient(35%_80%_at_49%_0%,--theme(--color-foreground/.08),transparent)] contain-strict" />
      </div>

      {/* X Bold Faded Borders */}
      <div
        aria-hidden="true"
        className="absolute inset-0 mx-auto hidden min-h-screen w-full max-w-5xl lg:block"
      >
        <div className="mask-y-from-80% mask-y-to-100% absolute inset-y-0 left-0 z-10 h-full w-px bg-foreground/15" />
        <div className="mask-y-from-80% mask-y-to-100% absolute inset-y-0 right-0 z-10 h-full w-px bg-foreground/15" />
      </div>

      {/* main content */}
      <div className="relative flex flex-col items-center justify-center gap-5 pt-32 pb-30">
        {/* X Content Faded Borders */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-1 size-full overflow-hidden"
        >
          <div className="absolute inset-y-0 left-4 w-px bg-linear-to-b from-transparent via-foreground/10 to-foreground/10 md:left-8" />
          <div className="absolute inset-y-0 right-4 w-px bg-linear-to-b from-transparent via-foreground/10 to-foreground/10 md:right-8" />
          <div className="absolute inset-y-0 left-8 w-px bg-linear-to-b from-transparent via-foreground/5 to-foreground/5 md:left-12" />
          <div className="absolute inset-y-0 right-8 w-px bg-linear-to-b from-transparent via-foreground/5 to-foreground/5 md:right-12" />
        </div>

        {/* Badge */}
        <div
          className={cn(
            "mx-auto flex w-fit items-center gap-3 rounded-full border border-foreground/10 bg-foreground/5 px-4 py-1.5 shadow-sm",
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-500 duration-500 ease-out"
          )}
        >
          <Volume2Icon className="size-3 text-foreground/50" />
          <span className="text-xs text-foreground/70">매일 아침, 음성 브리핑</span>
        </div>

        {/* Heading */}
        <h1
          className={cn(
            "fade-in slide-in-from-bottom-10 animate-in text-balance fill-mode-backwards text-center text-4xl font-bold tracking-tight delay-100 duration-500 ease-out md:text-5xl lg:text-6xl"
          )}
        >
          5분이면 충분한 <br /> 나만의 주식 뉴스 브리핑
        </h1>

        {/* Description */}
        <p className="fade-in slide-in-from-bottom-10 mx-auto max-w-lg animate-in fill-mode-backwards text-center text-base text-foreground/60 tracking-wider delay-200 duration-500 ease-out sm:text-lg md:text-xl">
          내가 설정한 종목의 어제 뉴스를 <br /> 매일 아침 음성으로 요약해드립니다
        </p>

        {/* CTA / Selected Stocks */}
        <div className="fade-in slide-in-from-bottom-10 flex animate-in flex-col items-center gap-4 fill-mode-backwards pt-2 delay-300 duration-500 ease-out">
          {savedStocks.length > 0 ? (
            <>
              <div className="flex flex-wrap justify-center gap-2">
                {savedStocks.map((stock) => (
                  <span
                    key={stock}
                    className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/5 px-4 py-1.5 text-sm font-medium"
                  >
                    <TrendingUpIcon className="size-3 text-foreground/50" />
                    {stock}
                  </span>
                ))}
              </div>
              {briefingData ? (
                <AudioPlayer
                  audioBase64={briefingData.audioBase64}
                  script={briefingData.script}
                  glossary={briefingData.glossary}
                />
              ) : (
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
              )}
              {briefingError && (
                <p className="text-sm text-red-500">{briefingError}</p>
              )}
              <div className="flex items-center gap-3">
                <Button
                  className="rounded-full"
                  size="sm"
                  variant="secondary"
                  onClick={handleCtaClick}
                >
                  <RefreshCwIcon className="size-3.5 mr-1.5" />
                  종목 재설정하기
                </Button>
                <Button
                  className="rounded-full"
                  size="sm"
                  variant="ghost"
                  onClick={handleLogout}
                >
                  <LogOutIcon className="size-3.5 mr-1.5" />
                  로그아웃
                </Button>
              </div>
            </>
          ) : (
            <Button
              className="rounded-full"
              size="lg"
              onClick={handleCtaClick}
            >
              <TrendingUpIcon className="size-4 mr-2" />
              주식 설정하기
            </Button>
          )}

          {/* Login Dialog */}
          <LoginDialog
            open={loginDialogOpen}
            onOpenChange={setLoginDialogOpen}
            onLoginSuccess={handleLoginSuccess}
          />

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
        </div>
      </div>
    </section>
  );
}

export function FeaturesSection() {
  return (
    <section className="relative border-t border-foreground/10 pt-10 pb-16">
      <div className="mx-auto max-w-4xl px-6">
        <h2 className="text-center font-medium text-lg text-foreground/50 tracking-tight md:text-xl mb-10">
          <span className="text-foreground">피트스탁</span>이 제공하는 것
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <FeatureCard
            icon={<TrendingUpIcon className="size-5" />}
            title="관심 종목 설정"
            description="최대 5개의 국내 주식을 설정하고 맞춤 뉴스를 받으세요"
          />
          <FeatureCard
            icon={<ClockIcon className="size-5" />}
            title="하루 한 번 브리핑"
            description="지난 24시간의 주요 뉴스를 5분 만에 확인하세요"
          />
          <FeatureCard
            icon={<Volume2Icon className="size-5" />}
            title="음성 브리핑"
            description="읽을 필요 없이 들으면서 뉴스를 파악하세요"
          />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-6 text-center">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-foreground/5 text-foreground/70">
        {icon}
      </div>
      <h3 className="mb-1 font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-foreground/50">{description}</p>
    </div>
  );
}
