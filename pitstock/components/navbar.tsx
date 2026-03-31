"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LogOutIcon, UserIcon } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "뉴스브리핑 테스트" },
  { href: "/instagram", label: "인스타 자동업로드 테스트" },
];

export function Navbar({
  user,
  onLogout,
  onLoginClick,
}: {
  user?: { userId: string; name: string } | null;
  onLogout?: () => void;
  onLoginClick?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-foreground/10 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-12 max-w-5xl items-center gap-6 px-6">
        <Link href="/" className="text-sm font-bold tracking-tight">
          PitStock Lab
        </Link>
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                pathname === item.href
                  ? "bg-foreground/10 text-foreground"
                  : "text-foreground/50 hover:text-foreground/80"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <span className="text-xs text-foreground/50">
                <UserIcon className="inline size-3 mr-1" />
                {user.name}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7 px-2"
                onClick={onLogout}
              >
                <LogOutIcon className="size-3 mr-1" />
                로그아웃
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7 px-2"
              onClick={onLoginClick}
            >
              로그인
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
