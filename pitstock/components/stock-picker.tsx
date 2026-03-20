"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { STOCKS } from "@/lib/stocks";
import { SearchIcon, XIcon, CheckIcon } from "lucide-react";

const MAX_STOCKS = 5;

export function StockPicker({
  initialStocks = [],
  onSave,
}: {
  initialStocks?: string[];
  onSave?: (stocks: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(initialStocks);

  const filtered = useMemo(() => {
    if (query.length === 0) return STOCKS;
    const q = query.toLowerCase();
    return STOCKS.filter((s) => s.toLowerCase().includes(q));
  }, [query]);

  const isFull = selected.length >= MAX_STOCKS;

  function toggle(stock: string) {
    setSelected((prev) =>
      prev.includes(stock)
        ? prev.filter((s) => s !== stock)
        : prev.length < MAX_STOCKS
          ? [...prev, stock]
          : prev,
    );
  }

  function remove(stock: string) {
    setSelected((prev) => prev.filter((s) => s !== stock));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((stock) => (
            <span
              key={stock}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1 text-sm"
            >
              {stock}
              <button
                type="button"
                onClick={() => remove(stock)}
                className="text-foreground/40 hover:text-foreground transition-colors cursor-pointer"
                aria-label={`${stock} 제거`}
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/40" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="종목명을 검색하세요"
          aria-label="종목 검색"
          className={cn(
            "w-full rounded-lg border border-foreground/10 bg-foreground/5 py-2.5 pl-10 pr-4 text-sm",
            "placeholder:text-foreground/40 focus:border-foreground/20 focus:outline-none transition-colors",
          )}
        />
      </div>

      {/* Results list */}
      <ul
        role="listbox"
        className="max-h-60 overflow-y-auto rounded-lg border border-foreground/10"
      >
        {filtered.length > 0 ? (
          filtered.map((stock) => {
            const isSelected = selected.includes(stock);
            const disabled = isFull && !isSelected;
            return (
              <li
                key={stock}
                role="option"
                aria-selected={isSelected}
                onClick={() => !disabled && toggle(stock)}
                className={cn(
                  "flex items-center justify-between px-4 py-2.5 text-sm transition-colors",
                  "border-b border-foreground/5 last:border-b-0",
                  disabled
                    ? "opacity-40 cursor-not-allowed"
                    : "cursor-pointer hover:bg-foreground/5",
                  isSelected && "bg-foreground/5",
                )}
              >
                <span>{stock}</span>
                {isSelected && (
                  <CheckIcon className="size-4 text-foreground/60" />
                )}
              </li>
            );
          })
        ) : (
          <li className="px-4 py-4 text-center text-sm text-foreground/40">
            검색 결과가 없습니다
          </li>
        )}
      </ul>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-foreground/10">
        <span className={cn("text-sm", isFull ? "text-foreground/50" : "text-foreground/40")}>
          {selected.length}/{MAX_STOCKS} 종목 선택됨
          {!isFull && " (5개 필수)"}
        </span>
        <Button
          size="sm"
          className="rounded-full"
          disabled={!isFull}
          onClick={() => onSave?.(selected)}
        >
          저장
        </Button>
      </div>
    </div>
  );
}
