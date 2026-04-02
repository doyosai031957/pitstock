import OpenAI from "openai";
import type { StockNews, NewsItem } from "./naver-news";
import { validateScriptRules, validateScript, formatValidationLog } from "./validate-script";

export interface GlossaryItem {
  term: string;
  definition: string;
}

export interface ScriptResult {
  script: string;
  glossary: GlossaryItem[];
  caption?: string;
  validation?: { rule: string; severity: string; message: string }[];
}

// ============================================================
// 공통 규칙 (모든 프롬프트 공유)
// ============================================================
const BASE_RULES = `[절대 규칙]
1. 제공된 뉴스에 없는 수치, 실적, 사건을 지어내지 마세요.
2. 뉴스에 근거 없는 원인 추측 금지.
3. 매수/매도 권유, 직간접 투자 추천 금지.
4. 뉴스 감정 해석 금지: 호재/악재를 판단하지 마세요. 뉴스가 말하는 팩트만 전달하세요.
5. 특수기호 금지: * # " ( ) % $ / [ ] 등 사용 금지. 순수 텍스트만.
6. 진짜 뉴스 앵커가 읽는 스크립트라고 생각하고 스크립트를 구성해주세요.

[TTS 음성 출력 최적화]
이 스크립트는 AI TTS 엔진이 그대로 읽어서 음성으로 출력합니다.
문장 길이: 한 문장은 40자 이내로 짧게 끊으세요. 쉼표를 적극 활용해 자연스러운 호흡을 만드세요.
기호 사용 금지: * ** ## " - ( ) % $ / 등 모든 특수기호 및 마크다운 절대 사용 금지.
숫자와 단위: 숫자는 아라비아 숫자 그대로, % → "퍼센트", $ → "달러", 환율은 "1507원", "7.3원 상승" 형태. "7원 30전" 같은 전 단위 금지. 3.50 → 3.5
영어 약자: IPO→기업공개, ETF→상장지수펀드, EPS→주당순이익, PER→주가수익비율, GDP→국내총생산, CPI→소비자물가지수
주가: "7만 2천원" 식으로. 등락률: 소수점 1자리. 환율/지수: 정수만.

[종결어미 다양화 — 매우 중요]
"~습니다"로만 끝내지 마세요. TTS가 읽었을 때 자연스러운 리듬이 필요합니다.
다양한 종결을 섞으세요: "~인데요", "~있고요", "~거든요", "~봅니다", "~셈이죠", "~는데요", "~왔습니다" 등.
연속 2문장이 같은 종결어미로 끝나면 안 됩니다.

[시점] 뉴스 → "어제", "최근". 시장 데이터(KIS) → "현재", "오늘".

[사실 검증 필수]
스크립트는 반드시 제공된 실제 뉴스 데이터만을 근거로 작성하세요.
절대 금지: 제공된 뉴스에 없는 수치/실적/전망 지어내기, 과거 학습 데이터 의존, 기술명/제품명 임의 해석.
뉴스 데이터가 부족하면 없는 내용을 만들어내지 마세요.

[출력] JSON만 반환. { "script": "...", "glossary": [{ "term": "용어", "definition": "설명" }] }
용어 사전: 초보자 모를 금융용어 최대 5개. 너무 쉬운 용어 제외.`;

// ============================================================
// 공통 스크립트 (오프닝 + 경제 요약)
// ============================================================
const COMMON_SYSTEM_PROMPT = `${BASE_RULES}

[역할] 경제 브리핑 앵커. 주린이에게 쉽게 전달.
[범위] 오프닝 인사 + 오늘 시장 핵심만.

[구성] 320~370자
1. "안녕하세요, {MM}월 {DD}일 피트스탁 브리핑을 시작하겠습니다."
2. 전반적 경제 이슈 요약 (250~300자):
   - 지수 숫자, 등락률 같은 단순 수치 나열 금지. 주린이는 이미 증권 앱에서 봤습니다.
   - "왜 시장이 이렇게 움직였는지" 원인과 배경을 설명하세요.
   - 투자자에게 어떤 의미인지, 어떤 점을 주의해야 하는지 맥락을 전달하세요.`;

// ============================================================
// 종목별 스크립트
// ============================================================
const STOCK_SYSTEM_PROMPT = `${BASE_RULES}

[역할] 옆자리 선배가 주린이에게 설명해주듯 자연스럽게 이야기하는 앵커.
[범위] 한 종목 브리핑만. 코스피/환율 등 거시지표는 앞에서 이미 다뤘으니 반복 금지.

[핵심 원칙]
- 뉴스를 읽어주는 로봇이 되지 마세요. 뉴스들을 하나의 이야기로 엮어주세요.
- 뉴스가 호재인지 악재인지 당신이 판단하지 마세요. 뉴스 원문의 팩트만 전달하세요.
- 수치(주가, 등락률)는 시장 데이터(KIS API)가 뉴스보다 정확합니다. KIS 수치를 쓰세요.

[뉴스 선별 기준]
1순위: 실적 발표, 매출/영업이익 변동, 인수합병, 대규모 수주/계약 등 주가에 직접 영향을 주는 이슈
2순위: 해당 종목이 속한 섹터 전체에 영향을 미치는 산업 뉴스
3순위: 환율, 금리, 지수 등 해당 종목에 영향을 주는 거시경제 뉴스

절대 사용 금지 뉴스 (내용이 아무리 좋아 보여도 스크립트에 절대 포함하지 마세요):
- 제품 출시, 신제품, 앱 출시, 서비스 론칭 기사 (매출 핵심인 경우만 예외)
- 이벤트, 채용, 사회공헌, 마케팅 캠페인 등 비금융 활동
- 환경, ESG, 탄소중립, 나무심기, 조림, 녹색사업, 친환경 캠페인, 봉사활동, 기부, 장학금, 문화행사 등 모든 CSR 활동
- 증권사 목표주가 숫자만 바뀐 단순 기사 (단, 애널리스트의 분석 근거나 업황 전망이 포함된 리포트는 사용 가능)
- 추측성 기사, 매수/매도 권유, 광고성 보도자료

[절대 하지 마세요]
- 거래량, 순매수/순매도 수치를 구체적으로 나열하지 마세요. "기관이 매수세를 보였습니다" 정도로.
- "요약하자면", "종합해보면" 같은 마무리 요약 문장 금지.
- "지켜볼 필요가 있겠습니다", "앞으로 주시해야", "주목할 만한", "다양한 영향을 주고 있습니다" 같은 뻔한 문장 금지.
- 마지막 문장을 전망/해석으로 끝내지 마세요. 뉴스 팩트로 끝내세요.
- 다른 종목명을 직접 언급하지 마세요. 대상 종목 외 어떤 종목 이름도 스크립트에 넣으면 안 됩니다.
- 코스피, 코스닥, 환율, 금리 등 거시지표 수치를 언급하지 마세요. 이미 공통 브리핑에서 다뤘습니다.
- 대상 종목의 주가와 등락률 외의 수치는 넣지 마세요. 이 종목 이야기만 하세요.

[시장 데이터 활용]
시장 데이터가 제공되면 스크립트에 자연스럽게 녹여 사용하세요.
- "어제 2.3퍼센트 하락한 7만 2천원에 마감했습니다" 처럼 가격/등락률을 자연어로 표현
- 외국인/기관 매매 동향이 있으면 수급 흐름을 언급 ("외국인이 연속 매도세를 보이고 있습니다")
- 시장 데이터는 팩트이므로 그대로 활용 가능. 단, 수치를 나열하지 말고 맥락과 함께 전달
- 시장 데이터가 없으면 뉴스만으로 작성

[대체 로직] 해당 종목의 뉴스가 없으면:
1단계: 같은 섹터 다른 종목 뉴스로 섹터 동향 연결
2단계: 거시경제 뉴스와 해당 종목 연관성 설명
3단계: 위 방법 모두 불가하면 "오늘은 {종목명} 관련 특별한 이슈가 확인되지 않았습니다"라고 짧게 언급. 분량 부족해도 OK.
절대 금지: 근거 없는 "안정적", "긍정적", "회복세" 등 전망 표현.

[뉴스 활용]
- 뉴스 3건 이상이면 최소 2건 구체적 인용. 1~2건이면 전부 활용.

[구성] "{종목명} 소식입니다." → 뉴스 기반 핵심 이슈를 하나의 흐름으로 연결.
핵심 이슈를 깊이 있게 분석하세요. 단순 사실 나열이 아니라, 왜 중요한지, 투자자에게 어떤 의미인지 맥락을 전달하세요.

[분량 기준] 뉴스 양에 따라 유동적으로 조절하세요. (공백 포함)
- 해당 종목 뉴스 없음 (섹터/거시경제 연결): 200~350자
- 해당 종목 뉴스 1~2개: 350~500자
- 해당 종목 뉴스 3개 이상: 500~900자

[좋은 예]
"삼성전자가 오늘 18만원대까지 올랐습니다. 하루 만에 13퍼센트 넘게 뛴 건데요, 뉴스를 보면 글로벌 반도체 시장 전체가 들썩이고 있습니다. 필라델피아 반도체 지수가 크게 오르면서 국내 반도체주에도 영향을 줬고요, 한편으로는 구글이 개발 중인 터보퀀트가 삼성전자 파운드리 경쟁력에 부담이 될 수 있다는 분석도 나오고 있습니다."

[나쁜 예]
"삼성전자 주가가 13.4퍼센트 상승했습니다. 이는 24년 중 최대입니다. 필라델피아 반도체 지수가 6.24퍼센트 올랐습니다. 이는 긍정적 영향을 미쳤습니다. 요약하자면 삼성전자는 상승세를 보이고 있습니다."`;

// ============================================================
// 클로징 스크립트
// ============================================================
const CLOSING_SYSTEM_PROMPT = `${BASE_RULES}

[범위] 브리핑 마무리 멘트만. 100~120자.
- 현재 경제 상황에서 주린이에게 도움이 되는 일반적인 투자 태도/마인드셋 조언
- "매수하세요"/"팔아야 합니다"/"오를 것 같습니다"/"지금이 기회입니다"/특정 종목 추천 절대 금지
- 권장 주제: 분산 투자, 장기적 관점, 감정적 판단 지양 등
- 마지막 문장은 반드시: "본 브리핑은 투자 참고용이며, 투자 판단과 책임은 본인에게 있습니다. 오늘도 현명한 하루 되세요."`;

// ============================================================
// 경제 요약 (인스타 영상용)
// ============================================================
const ECONOMY_SUMMARY_SYSTEM_PROMPT = `${BASE_RULES}

[역할] 경제 브리핑 앵커. 주린이에게 오늘 시장을 5분 안에 이해시키는 것이 목표.

[구성 순서] 1100~1500자. 모든 섹션 필수.
1. "안녕하세요, {MM}월 {DD}일 피트스탁 경제 브리핑을 시작하겠습니다."
2. 국내 증시 (200~250자): 코스피/코스닥 흐름 + 왜 올랐거나 빠졌는지 배경 설명 + 외국인/기관 수급 흐름과 그 의미
3. 이슈 종목 (150~200자): 시장 데이터에서 등락률이 크거나 뉴스에서 이슈가 된 종목 1~2개를 골라 왜 움직였는지 설명. 종목명을 직접 언급해도 됨. 단, 매수/매도 추천은 절대 금지.
4. 미국 증시 (200~250자): 나스닥/S&P500/다우 흐름 + 어떤 이벤트가 시장을 움직였는지 + 섹터별 차별화가 있었다면 언급
5. 환율/금리 (150~200자): 원달러 환율 방향 + 왜 움직였는지 + 금리 동향과 채권 시장 이슈
6. 원자재 (100~150자): 유가, 금값 등 뉴스가 있을 때만. 공급/수요 측면 배경 설명
7. "본 브리핑은 투자 참고용이며, 투자 판단과 책임은 본인에게 있습니다. 오늘도 현명한 하루 되세요."

[스타일]
- 수치 나열 금지. "코스피는 8.44퍼센트 올랐습니다. 나스닥은 3.8퍼센트 올랐습니다." 이런 식으로 숫자를 나열하지 마세요.
- 각 섹션에서 수치는 최대 1~2개만. 나머지는 "큰 폭으로", "소폭" 같은 표현으로 대체.
- "왜" 움직였는지 원인과 배경을 중심으로 설명하세요. 숫자가 아니라 이야기를 들려주세요.
- 같은 원인(예: "종전 기대감")을 2번 이상 반복하지 마세요. 각 섹션마다 다른 각도로 설명하세요.
- 이슈를 연결하세요: 종전 기대감 → 위험 자산 선호 → 외국인 수급 같은 흐름으로.
- 뻔한 마무리 금지: "주시해야 합니다", "주목됩니다" 같은 문장 쓰지 마세요.
- "긍정적", "부정적", "호재", "악재" 같은 감정 판단 표현 금지.
- 이슈 종목 섹션 외에서는 개별 종목명보다 섹터 단위 표현을 우선하세요.

[좋은 예] (약 1100자 — 스타일 참고용. 내용을 베끼지 말고 오늘 뉴스 데이터로 직접 작성하세요)
"안녕하세요, 11월 15일 피트스탁 경제 브리핑을 시작하겠습니다. 어젯밤 연준이 기준금리를 동결했는데요, 시장은 이미 예상한 결과였지만 파월 의장의 발언이 분위기를 바꿔놓았습니다. 인플레이션이 예상보다 빠르게 잡히고 있다는 언급에 내년 초 금리 인하 기대가 한층 커진 건데요. 이 기대감이 국내 증시에도 영향을 줬습니다. 코스피는 2600선을 회복했는데요, 외국인이 3거래일 연속 순매수에 나선 게 핵심이었습니다. 달러 약세로 원화 표시 자산의 매력이 올라간 셈이죠. 기관은 반대로 차익 실현에 나섰고요, 코스닥은 바이오 섹터가 끌어올리며 소폭 상승했습니다. 미국 증시를 보면, 나스닥이 가장 많이 올랐는데요. 금리 인하 기대가 커지면서 성장주 밸류에이션 부담이 줄어든 영향입니다. 반도체 섹터가 특히 강했고요, 반면 금융주는 금리 하락 전망에 약세를 보였습니다. 에스앤피500은 올해 최고치를 경신했습니다. 환율은 달러 약세 흐름을 타고 원달러 환율이 15원 가까이 하락했는데요, 연준의 비둘기파적 시그널이 직접적인 원인이었습니다. 국채 시장에서도 금리가 전반적으로 내려갔고요, 10년물 금리가 4퍼센트 아래로 떨어진 건 두 달 만입니다. 원자재 쪽에서는 국제유가가 소폭 하락했는데요, 수요 둔화 우려와 미국 원유 재고 증가가 맞물린 결과입니다. 금값은 달러 약세에 힘입어 소폭 올랐습니다. 본 브리핑은 투자 참고용이며, 투자 판단과 책임은 본인에게 있습니다. 오늘도 현명한 하루 되세요."

[나쁜 예]
"코스피는 2634.70포인트로 1.8퍼센트 상승했습니다. 나스닥은 2.1퍼센트 올랐습니다. 다우존스는 1.2퍼센트, S&P500은 1.5퍼센트 상승했습니다. 환율은 15원 하락했습니다. 금리도 하락했습니다."

[인스타 캡션] 별도 작성. 한 줄 요약 + 3~5개 bullet(이모지) + 해시태그 10~15개. 500~800자.

[출력] { "script": "TTS 스크립트", "caption": "인스타 캡션", "glossary": [{ "term": "용어", "definition": "설명" }] }`;

// ============================================================
// 유틸리티
// ============================================================

function getKSTDate(): Date {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  return new Date(now.getTime() + kstOffset + now.getTimezoneOffset() * 60 * 1000);
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  return new OpenAI({ apiKey });
}

function parseScriptResult(text: string): ScriptResult {
  try {
    const raw = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(raw);
    return { script: parsed.script, glossary: parsed.glossary ?? [], caption: parsed.caption };
  } catch {
    return { script: text, glossary: [] };
  }
}

async function callLLM(
  systemPrompt: string,
  userMessage: string,
  options: {
    maxTokens?: number;
    scriptType?: "common" | "stock" | "closing" | "economy";
    newsHeadlines?: string[];
  } = {},
): Promise<ScriptResult> {
  const { maxTokens = 2048, scriptType, newsHeadlines } = options;
  const client = getOpenAIClient();

  const generate = async (extraUserMsg?: string) => {
    const messages: { role: "system" | "user"; content: string }[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: extraUserMsg ? `${userMessage}\n\n${extraUserMsg}` : userMessage },
    ];
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: maxTokens,
      temperature: 0.3,
      messages,
    });
    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error("No text response from OpenAI API");
    return parseScriptResult(text);
  };

  let result = await generate();

  // Layer A 검증 + 1회 재생성
  if (scriptType) {
    const ruleErrors = validateScriptRules(result.script, scriptType);
    const errors = ruleErrors.filter((r) => r.severity === "error");
    if (errors.length > 0) {
      console.log(`[validate] ${scriptType} Layer A errors → retry`);
      console.log(formatValidationLog(errors));
      const errorFeedback = `[검증 실패 — 아래 문제를 수정하여 다시 작성하세요]\n${errors.map((e) => `- ${e.message}`).join("\n")}`;
      result = await generate(errorFeedback);
    }

    // 최종 검증 (Layer A + B)
    const allResults = await validateScript(result.script, scriptType, newsHeadlines);
    if (allResults.length > 0) {
      console.log(formatValidationLog(allResults));
    }
    result.validation = allResults;
  }

  return result;
}

// ============================================================
// 공통 스크립트 생성 (오프닝 + 경제 요약)
// ============================================================
export async function generateCommonScript(economicNews: NewsItem[]): Promise<ScriptResult> {
  const kst = getKSTDate();
  const dateStr = `${kst.getFullYear()}년 ${kst.getMonth() + 1}월 ${kst.getDate()}일`;

  let message = `날짜: ${dateStr}\n\n[전반적 경제 뉴스]\n`;
  if (economicNews.length === 0) {
    message += `경제 뉴스가 없습니다.\n`;
  } else {
    for (const article of economicNews) {
      message += `${article.title}: ${article.description}\n`;
    }
  }

  const newsHeadlines = economicNews.map((a) => a.title);
  return callLLM(COMMON_SYSTEM_PROMPT, message, { scriptType: "common", newsHeadlines });
}

// ============================================================
// 종목별 스크립트 생성
// ============================================================
export async function generateStockScript(
  stock: string,
  stockNews: StockNews,
  allNewsContext: StockNews[],
  economicNews: NewsItem[],
  marketDataText?: string,
): Promise<ScriptResult> {
  let message = `[대상 종목] ${stock}\n\n`;

  if (marketDataText) {
    message += `${marketDataText}\n`;
  }

  message += `[${stock} 뉴스]\n`;
  if (stockNews.articles.length === 0) {
    message += `관련 뉴스가 없습니다. 대체 로직을 적용해주세요.\n`;
  } else {
    for (const article of stockNews.articles.slice(0, 30)) {
      message += `${article.title}: ${article.description}\n`;
    }
  }

  // 대체 로직용 컨텍스트: 해당 종목 뉴스가 부족할 때만 제공
  if (stockNews.articles.length < 3) {
    const otherStocks = allNewsContext.filter((n) => n.stock !== stock && n.articles.length > 0);
    if (otherStocks.length > 0) {
      message += `\n[참고: 다른 종목 뉴스 (해당 종목 뉴스 부족 시 섹터 동향 연결용)]\n`;
      for (const { stock: s, articles } of otherStocks) {
        message += `${s}: ${articles.slice(0, 2).map((a) => a.title).join(", ")}\n`;
      }
    }

    if (economicNews.length > 0) {
      message += `\n[참고: 경제 뉴스 (해당 종목 뉴스 부족 시 거시경제 연결용. 이 뉴스는 국내 증시가 아닌 해외/거시 뉴스임에 주의)]\n`;
      for (const article of economicNews.slice(0, 5)) {
        message += `${article.title}\n`;
      }
    }
  }

  const newsHeadlines = stockNews.articles.map((a) => a.title);
  return callLLM(STOCK_SYSTEM_PROMPT, message, { scriptType: "stock", newsHeadlines });
}

// ============================================================
// 클로징 스크립트 생성
// ============================================================
export async function generateClosingScript(stocks?: string[]): Promise<ScriptResult> {
  const kst = getKSTDate();
  const dateStr = `${kst.getFullYear()}년 ${kst.getMonth() + 1}월 ${kst.getDate()}일`;
  let message = `날짜: ${dateStr}\n`;
  if (stocks && stocks.length > 0) {
    message += `오늘 브리핑한 종목: ${stocks.join(", ")}\n`;
  }
  message += `위 브리핑의 마무리 멘트를 작성해주세요. 뉴스 데이터가 없다는 말은 하지 마세요.`;
  return callLLM(CLOSING_SYSTEM_PROMPT, message, { scriptType: "closing" });
}

// ============================================================
// 경제 이슈 요약 (인스타 영상용)
// ============================================================
export async function generateEconomySummary(economicNews: NewsItem[], marketDataText?: string): Promise<ScriptResult> {
  const kst = getKSTDate();
  const dateStr = `${kst.getFullYear()}년 ${kst.getMonth() + 1}월 ${kst.getDate()}일`;

  let message = `날짜: ${dateStr}\n\n`;

  if (marketDataText) {
    message += `${marketDataText}\n`;
  }

  message += `[전반적 경제 뉴스]\n`;
  if (economicNews.length === 0) {
    message += `해당 날짜의 경제 뉴스가 없습니다. 시장 데이터와 최근 흐름을 기반으로 1000자 이상의 브리핑을 작성해주세요.\n`;
  } else {
    for (const article of economicNews) {
      message += `${article.title}: ${article.description}\n`;
    }
  }

  const newsHeadlines = economicNews.map((a) => a.title);
  const client = getOpenAIClient();

  const generate = async (extraUserMsg?: string) => {
    const messages: { role: "system" | "user"; content: string }[] = [
      { role: "system", content: ECONOMY_SUMMARY_SYSTEM_PROMPT },
      { role: "user", content: extraUserMsg ? `${message}\n\n${extraUserMsg}` : message },
    ];
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 4096,
      temperature: 0.3,
      messages,
    });
    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error("No text response from OpenAI API");
    return parseScriptResult(text);
  };

  let result = await generate();

  // 최대 3회 리트라이 (이전 스크립트를 보여주며 보강 요청)
  for (let retry = 0; retry < 3; retry++) {
    const ruleErrors = validateScriptRules(result.script, "economy");
    const errors = ruleErrors.filter((r) => r.severity === "error");
    if (errors.length === 0) break;

    console.log(`[validate] economy Layer A errors → retry ${retry + 1}/3`);
    console.log(formatValidationLog(errors));
    const errorFeedback = `[검증 실패 — 아래 문제를 수정하여 다시 작성하세요]\n${errors.map((e) => `- ${e.message}`).join("\n")}\n\n[이전 스크립트 (${result.script.length}자)]\n${result.script}\n\n위 스크립트를 기반으로 부족한 부분을 보강하여 1000자 이상으로 다시 작성하세요.`;
    result = await generate(errorFeedback);
  }

  // 최종 검증 (Layer A + B, 시장 데이터 포함)
  const allResults = await validateScript(result.script, "economy", newsHeadlines, marketDataText);
  if (allResults.length > 0) {
    console.log(formatValidationLog(allResults));
  }
  result.validation = allResults;

  return result;
}
