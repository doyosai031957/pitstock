/**
 * 스크립트 검증 레이어
 *
 * Layer A: 규칙 기반 검증 (즉시, 무료)
 * Layer B: LLM 시맨틱 검증 (gpt-4o-mini, 저비용)
 */
import OpenAI from "openai";

export interface ValidationResult {
  rule: string;
  severity: "error" | "warning";
  message: string;
}

// ============================================================
// Layer A: 규칙 기반 검증
// ============================================================

const FORBIDDEN_CHARS = /[*#"()%$/\\[\]{}]/;
const MARKDOWN_PATTERN = /(\*\*|__|##|```|---|\[.*\]\(.*\))/;
const CLOSING_PHRASE = "투자 판단과 책임은 본인에게 있습니다";

const FORBIDDEN_EXPRESSIONS = [
  // 투자 권유
  "매수하세요", "매수 추천", "매수해야", "사야 합니다", "사세요",
  "매도하세요", "매도 추천", "매도해야", "팔아야", "파세요",
  "오를 것 같", "내릴 것 같", "상승할 것", "하락할 것",
  "지금이 기회", "투자 매력",
  "강력 추천", "적극 매수", "적극 매도",
  "비둘기파적", "매파적", "낙관적 전망", "비관적 전망",
  // 요약/마무리 패턴
  "요약하자면", "종합해보면", "종합하면", "이렇게 볼 때",
  "이렇게 종합", "정리하자면", "결론적으로",
  // 뻔한 filler 마무리
  "지켜볼 필요가 있", "주시할 필요가 있", "주목할 필요가 있",
  "다양한 영향을 주고", "다양한 요인들이",
  "중요한 지표가 될",
  "앞으로의 움직임", "앞으로도 주시", "앞으로의 흐름",
  "기대를 받고 있습니다",
  "주목할 만한 흐름",
  // 용어 사전이 script에 들어간 경우
  "용어 사전", "용어 해설", "다음은 용어",
];

// 정규식으로 검사하는 패턴 (조사 변형 대응)
const FORBIDDEN_PATTERNS = [
  /긍정적(?:인|인\s)?\s*(?:신호|영향|요소|효과)/,
  /부정적(?:인|인\s)?\s*(?:신호|영향|요소|효과)/,
  /긍정적으로 작용/,
  /부정적으로 작용/,
  /이러한.*영향을 미/,  // "이러한 XXX은 YYY에 영향을 미쳤습니다" 패턴
  /순매수\s*\d+만?\s*\d*천?\s*\d*주/, // "순매수 10만 3천 748주" 수치 나열
  /순매도\s*\d+만?\s*\d*천?\s*\d*주/, // "순매도 6천 411주" 수치 나열
  /거래량[이은는도]\s*\d+만\s*주/, // "거래량은 57만 주" 수치 나열
];

const ENGLISH_ABBREVIATIONS: Record<string, string> = {
  "IPO": "기업공개",
  "ETF": "상장지수펀드",
  "EPS": "주당순이익",
  "PER": "주가수익비율",
  "GDP": "국내총생산",
  "CPI": "소비자물가지수",
  "PCE": "개인소비지출",
  "FOMC": "연방공개시장위원회",
};

// 영어 약자 패턴: 단어 경계에서 대문자 2글자 이상
const ABBR_PATTERN = /\b([A-Z]{2,})\b/g;

export function validateScriptRules(
  script: string,
  type: "common" | "stock" | "closing" | "economy",
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // 1. 금지 특수문자
  const charMatch = script.match(FORBIDDEN_CHARS);
  if (charMatch) {
    results.push({
      rule: "forbidden-chars",
      severity: "error",
      message: `금지 특수문자 발견: "${charMatch[0]}"`,
    });
  }

  // 2. 마크다운 패턴
  const mdMatch = script.match(MARKDOWN_PATTERN);
  if (mdMatch) {
    results.push({
      rule: "markdown",
      severity: "error",
      message: `마크다운 패턴 발견: "${mdMatch[0]}"`,
    });
  }

  // 3. 클로징 고정 문구 체크 (클로징/경제 요약만)
  if ((type === "closing" || type === "economy") && !script.includes(CLOSING_PHRASE)) {
    results.push({
      rule: "missing-closing",
      severity: "error",
      message: `필수 마무리 문구 누락: "${CLOSING_PHRASE}"`,
    });
  }

  // 4. 글자수 범위
  const len = script.length;
  const lengthRanges: Record<string, [number, number]> = {
    common: [250, 500],
    stock: [500, 1400],
    closing: [70, 200],
    economy: [1100, 1800],
  };
  const [min, max] = lengthRanges[type];
  if (len < min) {
    results.push({
      rule: "length-short",
      severity: "error",
      message: `스크립트 너무 짧음: ${len}자 (최소 ${min}자)`,
    });
  } else if (len > max) {
    results.push({
      rule: "length-long",
      severity: "warning",
      message: `스크립트 너무 김: ${len}자 (최대 ${max}자)`,
    });
  }

  // 5. 금지 표현 (문자열)
  for (const expr of FORBIDDEN_EXPRESSIONS) {
    if (script.includes(expr)) {
      results.push({
        rule: "forbidden-expression",
        severity: "error",
        message: `금지 표현 발견: "${expr}"`,
      });
    }
  }

  // 5b. 금지 패턴 (정규식 — 조사 변형 대응)
  for (const pattern of FORBIDDEN_PATTERNS) {
    const patternMatch = script.match(pattern);
    if (patternMatch) {
      results.push({
        rule: "forbidden-pattern",
        severity: "error",
        message: `금지 패턴 발견: "${patternMatch[0]}"`,
      });
    }
  }

  // 6. 영어 약자 미변환
  let match: RegExpExecArray | null;
  const abbrs: string[] = [];
  while ((match = ABBR_PATTERN.exec(script)) !== null) {
    const abbr = match[1];
    if (abbr in ENGLISH_ABBREVIATIONS) {
      abbrs.push(abbr);
    }
  }
  if (abbrs.length > 0) {
    results.push({
      rule: "english-abbreviation",
      severity: "warning",
      message: `영어 약자 미변환: ${abbrs.join(", ")} → 한글로 변환 필요`,
    });
  }

  // 7. 환율 소수점 체크 (예: 1507.30원)
  if (script.match(/\d+\.\d+원/)) {
    results.push({
      rule: "decimal-won",
      severity: "warning",
      message: `환율/주가에 소수점 발견. 정수 표현 필요`,
    });
  }

  // 8. % 기호 사용
  if (script.includes("%")) {
    results.push({
      rule: "percent-symbol",
      severity: "error",
      message: `% 기호 사용 금지. "퍼센트"로 표기`,
    });
  }

  return results;
}

// ============================================================
// Layer B: LLM 시맨틱 검증 (gpt-4o-mini)
// ============================================================

const SEMANTIC_VALIDATION_PROMPT = `당신은 금융 뉴스 브리핑 스크립트 품질 검증 전문가입니다.

아래 스크립트를 검증하고 문제점을 JSON 배열로 반환하세요.

[검증 항목]
1. 팩트 날조: 제공된 뉴스 데이터나 시장 데이터에 없는 수치, 사건, 실적이 스크립트에 있으면 지적. 시장 데이터(KIS API)에서 온 지수, 주가, 등락률은 팩트이므로 날조가 아닙니다.
2. 간접 매수/매도 추천: "투자 매력", "긍정적", "기회" 등 우회적 권유 표현
3. 시점 혼동: 뉴스(어제)를 "오늘"이라 하거나, 시장 데이터(오늘)를 "어제"라 한 경우
4. 국내/해외 혼동: 해외 증시 이슈를 국내 증시에 잘못 적용하거나, 특정 종목 뉴스를 다른 종목에 적용한 경우

[응답 형식]
문제가 없으면 빈 배열: []
문제가 있으면:
[{"rule": "hallucination|recommendation|time-confusion|market-confusion", "severity": "warning", "message": "구체적 설명"}]

JSON 배열만 반환. 다른 텍스트 없이.`;

export async function validateScriptSemantic(
  script: string,
  newsData: string[],
  marketDataText?: string,
): Promise<ValidationResult[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  try {
    const client = new OpenAI({ apiKey });

    let userMessage = `[스크립트]
${script}

[제공된 뉴스 데이터]
${newsData.join("\n")}`;

    if (marketDataText) {
      userMessage += `\n\n[시장 데이터 (KIS API — 이 수치는 팩트)]\n${marketDataText}`;
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1024,
      messages: [
        { role: "system", content: SEMANTIC_VALIDATION_PROMPT },
        { role: "user", content: userMessage },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) return [];

    const raw = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: { rule: string; severity: string; message: string }) => ({
      rule: item.rule || "semantic",
      severity: (item.severity === "error" ? "error" : "warning") as "error" | "warning",
      message: item.message || "",
    }));
  } catch (err) {
    console.error("[validate] Semantic validation failed:", err);
    return [];
  }
}

// ============================================================
// 통합 검증 함수
// ============================================================

export async function validateScript(
  script: string,
  type: "common" | "stock" | "closing" | "economy",
  newsHeadlines?: string[],
  marketDataText?: string,
): Promise<ValidationResult[]> {
  // Layer A: 규칙 기반 (즉시)
  const ruleResults = validateScriptRules(script, type);

  // Layer B: 시맨틱 (비동기, 뉴스 데이터가 있을 때만)
  let semanticResults: ValidationResult[] = [];
  if (newsHeadlines && newsHeadlines.length > 0 && type !== "closing") {
    semanticResults = await validateScriptSemantic(script, newsHeadlines, marketDataText);
  }

  return [...ruleResults, ...semanticResults];
}

export function hasErrors(results: ValidationResult[]): boolean {
  return results.some((r) => r.severity === "error");
}

export function formatValidationLog(results: ValidationResult[]): string {
  if (results.length === 0) return "[validate] OK";
  return results
    .map((r) => `[validate] ${r.severity.toUpperCase()}: [${r.rule}] ${r.message}`)
    .join("\n");
}
