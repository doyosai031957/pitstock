/**
 * 브리핑 히스토리 관리 (localStorage)
 * 최대 20건 저장, FIFO
 */
import { CURRENT_RULE_VERSION, getCurrentRuleInfo } from "./rule-changelog";
import type { RuleChange } from "./rule-changelog";

export interface BriefingHistoryEntry {
  id: string;
  timestamp: string;
  type: "briefing" | "economy";
  stocks: string[];
  script: string;
  glossary: { term: string; definition: string }[];
  validation?: { segment: string; issues: { rule: string; severity: string; message: string }[] }[];
  ruleVersion: string;
  ruleChanges: string[];
}

const STORAGE_KEY = "pitstock-history";
const MAX_ENTRIES = 20;

export function loadHistory(): BriefingHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BriefingHistoryEntry[];
  } catch {
    return [];
  }
}

export function saveToHistory(entry: Omit<BriefingHistoryEntry, "id" | "timestamp" | "ruleVersion" | "ruleChanges">): BriefingHistoryEntry {
  const history = loadHistory();
  const ruleInfo = getCurrentRuleInfo();
  const newEntry: BriefingHistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ruleVersion: CURRENT_RULE_VERSION,
    ruleChanges: ruleInfo.changes,
  };
  history.unshift(newEntry);
  if (history.length > MAX_ENTRIES) {
    history.length = MAX_ENTRIES;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  return newEntry;
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function deleteEntry(id: string): void {
  const history = loadHistory().filter((e) => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}
