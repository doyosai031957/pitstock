"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  loadHistory,
  clearHistory,
  deleteEntry,
} from "@/lib/briefing-history";
import type { BriefingHistoryEntry } from "@/lib/briefing-history";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  Trash2Icon,
  XIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  TagIcon,
} from "lucide-react";

export function HistoryPanel() {
  const [history, setHistory] = useState<BriefingHistoryEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  function refresh() {
    setHistory(loadHistory());
  }

  function handleClear() {
    clearHistory();
    setHistory([]);
    setExpandedId(null);
    setCompareIds(null);
  }

  function handleDelete(id: string) {
    deleteEntry(id);
    refresh();
    if (expandedId === id) setExpandedId(null);
  }

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id);
    setCompareIds(null);
  }

  function handleCompare(id: string) {
    if (!compareIds) {
      setCompareIds([id, ""]);
    } else if (compareIds[0] === id) {
      setCompareIds(null);
    } else {
      setCompareIds([compareIds[0], id]);
    }
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hour = d.getHours().toString().padStart(2, "0");
    const min = d.getMinutes().toString().padStart(2, "0");
    return `${month}/${day} ${hour}:${min}`;
  }

  function getPreview(script: string) {
    return script.length > 100 ? script.slice(0, 100) + "..." : script;
  }

  function totalIssues(entry: BriefingHistoryEntry) {
    if (!entry.validation) return 0;
    return entry.validation.reduce((sum, v) => sum + v.issues.length, 0);
  }

  function errorCount(entry: BriefingHistoryEntry) {
    if (!entry.validation) return 0;
    return entry.validation.reduce(
      (sum, v) => sum + v.issues.filter((i) => i.severity === "error").length,
      0,
    );
  }

  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-5">
        <h3 className="text-sm font-semibold text-foreground/70 mb-2">히스토리</h3>
        <p className="text-xs text-foreground/40">아직 생성된 브리핑이 없습니다.</p>
      </div>
    );
  }

  // 비교 모드
  if (compareIds && compareIds[1]) {
    const a = history.find((e) => e.id === compareIds[0]);
    const b = history.find((e) => e.id === compareIds[1]);
    if (a && b) {
      return (
        <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground/70">비교 모드</h3>
            <Button size="sm" variant="ghost" onClick={() => setCompareIds(null)}>
              <XIcon className="size-3.5 mr-1" /> 닫기
            </Button>
          </div>
          {a.ruleVersion !== b.ruleVersion && (
            <p className="text-[10px] text-purple-500 mb-3">
              규칙 버전이 다릅니다: v{a.ruleVersion} vs v{b.ruleVersion}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            {[a, b].map((entry) => (
              <div key={entry.id} className="space-y-2">
                <p className="text-xs font-medium text-foreground/50">
                  {formatTime(entry.timestamp)} | {entry.type === "briefing" ? "브리핑" : "경제"}
                  {entry.stocks.length > 0 && ` | ${entry.stocks.join(", ")}`}
                  {entry.ruleVersion && <span className="text-purple-500 font-mono ml-1">v{entry.ruleVersion}</span>}
                </p>
                {entry.ruleVersion && entry.ruleChanges && entry.ruleChanges.length > 0 && (
                  <RuleChangeInfo version={entry.ruleVersion} changes={entry.ruleChanges} />
                )}
                <p className="text-xs text-foreground/70 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                  {entry.script}
                </p>
                {entry.validation && entry.validation.length > 0 && (
                  <ValidationBadges entry={entry} />
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }
  }

  return (
    <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground/70">히스토리 ({history.length}건)</h3>
        <Button size="sm" variant="ghost" className="text-xs text-foreground/40" onClick={handleClear}>
          <Trash2Icon className="size-3 mr-1" /> 전체 삭제
        </Button>
      </div>

      {compareIds && !compareIds[1] && (
        <p className="text-xs text-blue-500 mb-3">비교할 두 번째 항목을 선택하세요.</p>
      )}

      <div className="space-y-2">
        {history.map((entry) => {
          const isExpanded = expandedId === entry.id;
          const isCompareSelected = compareIds?.[0] === entry.id;
          const issues = totalIssues(entry);
          const errors = errorCount(entry);

          return (
            <div
              key={entry.id}
              className={`rounded-lg border p-3 transition-colors ${
                isCompareSelected
                  ? "border-blue-400 bg-blue-500/5"
                  : "border-foreground/5 hover:border-foreground/10"
              }`}
            >
              <div className="flex items-center justify-between">
                <button
                  className="flex-1 text-left"
                  onClick={() => toggleExpand(entry.id)}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-foreground/50">{formatTime(entry.timestamp)}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      entry.type === "briefing"
                        ? "bg-foreground/5 text-foreground/60"
                        : "bg-blue-500/10 text-blue-600"
                    }`}>
                      {entry.type === "briefing" ? "브리핑" : "경제"}
                    </span>
                    {entry.stocks.length > 0 && (
                      <span className="text-[10px] text-foreground/40">
                        {entry.stocks.join(", ")}
                      </span>
                    )}
                    {entry.ruleVersion && (
                      <span className="flex items-center gap-0.5 text-[10px] text-purple-500 font-mono">
                        <TagIcon className="size-2.5" />v{entry.ruleVersion}
                      </span>
                    )}
                    {errors > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-red-500">
                        <AlertCircleIcon className="size-3" /> {errors}
                      </span>
                    )}
                    {issues > 0 && issues !== errors && (
                      <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
                        <AlertTriangleIcon className="size-3" /> {issues - errors}
                      </span>
                    )}
                  </div>
                  {!isExpanded && (
                    <p className="text-xs text-foreground/40 mt-1 line-clamp-1">{getPreview(entry.script)}</p>
                  )}
                </button>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => handleCompare(entry.id)}
                  >
                    {isCompareSelected ? "취소" : "비교"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDelete(entry.id)}>
                    <XIcon className="size-3 text-foreground/30" />
                  </Button>
                  {isExpanded ? (
                    <ChevronUpIcon className="size-3.5 text-foreground/30" />
                  ) : (
                    <ChevronDownIcon className="size-3.5 text-foreground/30" />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-foreground/5 space-y-3">
                  {entry.ruleVersion && entry.ruleChanges && entry.ruleChanges.length > 0 && (
                    <RuleChangeInfo version={entry.ruleVersion} changes={entry.ruleChanges} />
                  )}
                  <p className="text-xs text-foreground/70 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                    {entry.script}
                  </p>
                  {entry.glossary.length > 0 && (
                    <div className="pt-2 border-t border-foreground/5">
                      <p className="text-[10px] font-medium text-foreground/40 mb-1">용어 사전</p>
                      {entry.glossary.map((item) => (
                        <p key={item.term} className="text-[10px] text-foreground/50">
                          <span className="font-medium text-foreground/70">{item.term}</span>: {item.definition}
                        </p>
                      ))}
                    </div>
                  )}
                  {entry.validation && entry.validation.length > 0 && (
                    <ValidationBadges entry={entry} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RuleChangeInfo({ version, changes }: { version: string; changes: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md bg-purple-500/5 border border-purple-500/10 px-3 py-2">
      <button
        className="flex items-center gap-1.5 text-[10px] font-medium text-purple-600 w-full"
        onClick={() => setOpen(!open)}
      >
        <TagIcon className="size-3" />
        규칙 v{version} 적용
        {open ? <ChevronUpIcon className="size-3 ml-auto" /> : <ChevronDownIcon className="size-3 ml-auto" />}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-0.5">
          {changes.map((c, i) => (
            <li key={i} className="text-[10px] text-purple-500/80 pl-3">
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ValidationBadges({ entry }: { entry: BriefingHistoryEntry }) {
  if (!entry.validation || entry.validation.length === 0) return null;

  return (
    <div className="pt-2 border-t border-foreground/5">
      <p className="text-[10px] font-medium text-foreground/40 mb-1">검증 결과</p>
      <div className="space-y-1">
        {entry.validation.map((v) =>
          v.issues.map((issue, i) => (
            <p
              key={`${v.segment}-${i}`}
              className={`text-[10px] ${
                issue.severity === "error" ? "text-red-500" : "text-amber-500"
              }`}
            >
              [{v.segment}] {issue.message}
            </p>
          )),
        )}
      </div>
    </div>
  );
}
