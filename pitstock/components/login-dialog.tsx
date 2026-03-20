"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { login } from "@/lib/actions";
import { LogInIcon } from "lucide-react";

export function LoginDialog({
  open,
  onOpenChange,
  onLoginSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoginSuccess: (user: { userId: string; name: string }) => void;
}) {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(id, password);
    setLoading(false);
    if (result.success && result.user) {
      onLoginSuccess(result.user);
      setId("");
      setPassword("");
    } else {
      setError(result.error || "로그인에 실패했습니다.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>로그인</DialogTitle>
          <DialogDescription>
            서비스를 이용하려면 로그인이 필요합니다.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="login-id" className="text-sm font-medium">
              아이디
            </label>
            <input
              id="login-id"
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="아이디를 입력하세요"
              required
              className={cn(
                "w-full rounded-lg border border-foreground/10 bg-foreground/5 px-4 py-2.5 text-sm",
                "placeholder:text-foreground/40 focus:border-foreground/20 focus:outline-none transition-colors",
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="login-password" className="text-sm font-medium">
              비밀번호
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              required
              className={cn(
                "w-full rounded-lg border border-foreground/10 bg-foreground/5 px-4 py-2.5 text-sm",
                "placeholder:text-foreground/40 focus:border-foreground/20 focus:outline-none transition-colors",
              )}
            />
          </div>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <Button
            type="submit"
            className="rounded-full w-full"
            disabled={loading}
          >
            <LogInIcon className="size-4 mr-2" />
            {loading ? "로그인 중..." : "로그인"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
