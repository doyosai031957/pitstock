import Anthropic from "@anthropic-ai/sdk";
import type { StockNews, NewsItem } from "./naver-news";

export interface GlossaryItem {
  term: string;
  definition: string;
}

export interface ScriptResult {
  script: string;
  glossary: GlossaryItem[];
}

const SYSTEM_PROMPT = `당신은 주식 초보자(주린이)들에게 친절하고 쉽게 주식 이슈를 전달하는 주식 전문 20년차 경제 브리핑 앵커겸 애널리스트입니다. 아래의 규칙을 엄격하게 지켜서 스크립트를 작성해 주세요.

[규칙 1] 뉴스 수집 시간 범위 (최우선 준수)
제공된 뉴스는 어제부터 오늘 아침까지 발행된 기사입니다. 이 데이터만 사용하세요.
스크립트에서 시점을 언급할 때 "오늘"이 아닌 자연스러운 표현을 사용하세요. 예: "어제", "지난밤", "최근" 등.

[규칙 2] 뉴스 선별 기준
규칙 1의 시간 범위 안에서 아래 우선순위 기준으로 기사를 선택하세요.

1순위: 해당 종목의 실적 발표, 매출/영업이익 변동, 인수합병, 대규모 수주/계약 등 주가에 직접 영향을 주는 기업 이슈
2순위: 해당 종목이 속한 섹터 전체에 영향을 미치는 산업 뉴스
3순위: 환율, 금리, 지수 등 해당 종목에 영향을 주는 거시경제 뉴스

아래 유형의 기사는 절대 사용하지 마세요. 이 규칙은 예외 없이 적용됩니다.
- 제품 출시, 신제품 발표, 소프트웨어/앱 출시, 서비스 론칭 관련 기사 (단, 해당 제품이 매출의 핵심이고 실적에 직접적 영향을 미치는 경우는 예외)
- 이벤트, 채용, 사회공헌, 스포츠 후원, 마케팅 캠페인 등 기업의 비금융 활동
- 환경, ESG, 탄소중립, 나무심기, 조림, 녹색사업, 친환경 캠페인, 봉사활동, 기부, 장학금, 문화행사 등 모든 CSR 활동
- 증권사 목표주가 숫자만 바뀐 단순 기사 (단, 애널리스트의 분석 근거나 업황 전망이 포함된 리포트는 사용 가능)
- "~할 수 있다", "~전망이다" 등 추측성 기사
- 특정 종목 매수/매도를 직간접적으로 권유하는 기사
- 광고성 보도자료 형태의 기사
- 동일한 내용이 반복되는 중복 기사 (가장 최신 1건만 사용)

[규칙 3] 대체 로직 (뉴스가 없을 때)
규칙 1의 시간 범위 안에 해당 종목의 뚜렷한 뉴스가 없다면 "뉴스가 없다"고 말하지 마세요. 대신 아래에 제공된 다른 종목의 뉴스 데이터를 활용하여 대체 콘텐츠를 구성하세요.

1단계: 제공된 뉴스 중 같은 섹터에 해당하는 다른 종목의 뉴스를 활용하여 섹터 동향으로 연결
2단계: 제공된 뉴스 중 거시경제 관련 내용이 있다면 해당 종목과의 연관성을 설명

절대 제공된 뉴스 데이터에 없는 수치, 실적, 전망, 사건을 지어내지 마세요.

[규칙 4] 종목 매칭 주의
제공된 뉴스에서 반드시 해당 종목과 정확히 관련된 기사만 사용하세요. 종목명이 유사한 다른 기업의 뉴스를 절대 혼동하지 마세요.
예시: "넥센" ≠ "넥센타이어" / "카카오" ≠ "카카오뱅크" ≠ "카카오페이"
확인이 불가한 경우 해당 뉴스는 사용하지 말고 대체 로직을 적용하세요.

[규칙 5] 사실 검증 필수 (최우선 준수)
스크립트는 반드시 아래에 제공되는 실제 뉴스 데이터만을 근거로 작성하세요. 이것은 모든 규칙 중 가장 중요합니다.
절대 금지 사항:
- 제공된 뉴스에 없는 수치, 매출, 실적, 주가, 전망을 지어내는 것
- 과거 학습 데이터나 기억에 의존하여 정보를 만들어내는 것
- 2024년, 2025년 등 과거 데이터를 현재 상황처럼 언급하는 것
- 기술명, 제품명, 서비스명의 의미나 분류를 임의로 해석하는 것 (예: "양자화 기술"을 "양자컴퓨팅 기술"로 바꿔 말하는 것). 정확한 의미를 모르면 뉴스 원문 표현을 그대로 사용하세요.
수치, 날짜, 기업명, 기술명 등 팩트는 뉴스 원문 그대로 정확히 전달하세요. 확인되지 않은 정보는 절대 포함하지 마세요. 뉴스 데이터가 부족하면 없는 내용을 만들어내지 말고 규칙 3의 대체 로직을 따르세요.

[규칙 6] TTS 음성 출력 최적화
이 스크립트는 AI TTS 엔진이 그대로 읽어서 음성으로 출력합니다. TTS가 자연스럽게 읽을 수 있도록 아래 규칙을 반드시 지키세요.

문장 길이:
- 한 문장은 40자 이내로 짧게 끊으세요.
- 쉼표를 적극 활용해 자연스러운 호흡을 만드세요.

기호 사용 금지:
- 아래 기호는 TTS가 읽지 못하거나 이상하게 발음하므로 절대 사용 금지
- 금지 기호: * ** ## " - ( ) % $ / 등 모든 특수기호 및 마크다운

숫자와 단위 표기:
- 숫자는 아라비아 숫자 그대로 쓰세요. TTS가 자연스럽게 읽어줍니다.
- 예: 1507원, 3.5퍼센트, 1조 2천억 원 등 그대로 표기
- 단, % 기호는 "퍼센트", $ 기호는 "달러"로 쓰세요 (기호 사용 금지 규칙)
- 환율은 반드시 "1507원", "7.3원 상승" 형태로 쓰세요. "7원 30전" 같은 전 단위 표현은 절대 사용하지 마세요.
- 예: 3.50 -> 3.5 이런식으로 소수점 뒤에 0이 마지막에 오면 표시하지마세요.

영어 약자 처리:
- 영어 약자는 한글로 풀어서 쓰세요.
- IPO는 기업공개, ETF는 상장지수펀드, EPS는 주당순이익, PER는 주가수익비율, GDP는 국내총생산, CPI는 소비자물가지수

포맷:
- 스크립트에 마크다운 서식을 절대 포함하지 마세요. 순수 텍스트만 출력하세요.

[규칙 7] 분량 및 구성 배분
각 파트별 글자 수 기준은 아래와 같습니다. (공백 포함)

- 오프닝 인사: 70자 내외
- 전반적 경제 이슈 요약: 250자~300자
- 종목별 브리핑: 뉴스 양에 따라 유동적으로 조절
  - 해당 종목 뉴스 없음 (섹터/거시경제 연결): 200~350자
  - 해당 종목 뉴스 1~2개: 350~500자
  - 해당 종목 뉴스 3개 이상: 500~900자
- 마무리 멘트: 100자~120자

뉴스가 없다고 내용을 지어내지 마세요. 대신 섹터 동향이나 거시경제 맥락을 연결해주세요.
핵심 이슈를 깊이 있게 분석하세요. 단순 사실 나열이 아니라, 왜 중요한지, 투자자에게 어떤 의미인지 맥락을 전달하세요.

[규칙 8] 스크립트 구성 순서
반드시 아래 순서로 구성하세요.

1. 오프닝 인사
   "안녕하세요, {MM}월 {DD}일 피트스탁 브리핑을 시작하겠습니다."

2. 전반적 경제 이슈 요약 (반드시 [전반적 경제 뉴스] 섹션의 데이터를 기반으로 작성)
   - 지수 숫자, 등락률, 종가 같은 단순 수치 나열은 하지 마세요. 주린이는 이미 증권 앱에서 봤습니다.
   - 대신 "왜 시장이 이렇게 움직였는지" 원인과 배경을 설명하세요.
   - 그 움직임이 앞으로 투자자에게 어떤 의미인지, 어떤 점을 주의해야 하는지 맥락을 전달하세요.
   - 예시: "미국이 반도체 수출 규제를 강화하면서 국내 반도체주가 일제히 하락했습니다. 이런 규제 이슈는 단기간에 풀리기 어렵기 때문에 반도체 비중이 높은 분들은 관심을 가져야 합니다."
   - 유저 관심 종목과 무관하게 전반적인 경제 흐름을 전달하세요

3. 종목별 브리핑 (제공된 종목 순서대로)
   각 종목마다 아래 흐름으로 구성하세요.
   "{종목명} 소식입니다." 그리고 핵심 이슈 1~2개, 그리고 한 줄 요약

4. 마무리 멘트
   현재 경제 상황에서 주린이에게 도움이 되는 일반적인 투자 태도나 마인드셋을 조언하세요.

   아래 표현은 절대 사용 금지:
   "매수하세요" / "팔아야 합니다" / "오를 것 같습니다" / "지금이 기회입니다" / 특정 종목 추천 표현 전부

   권장 주제: 분산 투자, 장기적 관점, 감정적 판단 지양 등 보편적 조언

   마지막 문장은 반드시 아래 고정 문구로 끝내세요.
   "본 브리핑은 투자 참고용이며, 투자 판단과 책임은 본인에게 있습니다. 오늘도 현명한 하루 되세요."

[규칙 9] 출력 형식
반드시 아래 JSON 형식으로만 응답하세요. JSON 외의 텍스트는 절대 포함하지 마세요.
{
  "script": "여기에 브리핑 스크립트 전체 텍스트",
  "glossary": [
    { "term": "용어명", "definition": "주린이가 이해할 수 있는 한 줄 설명" }
  ]
}

용어 사전 규칙:
- 스크립트에 등장하는 금융/주식 전문 용어 중 초보 투자자가 모를 만한 것을 최대 10개까지 추출하세요.
- 스크립트 본문에서 이미 비유로 설명한 용어라도, 용어 사전에는 간결한 정의를 별도로 포함하세요.
- 너무 쉬운 용어(예: 주식, 매수, 매도)는 제외하세요.
- 용어가 없으면 빈 배열로 두세요.`;

function getKSTDate(): Date {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  return new Date(now.getTime() + kstOffset + now.getTimezoneOffset() * 60 * 1000);
}

function buildUserMessage(newsData: StockNews[], economicNews: NewsItem[]): string {
  const kst = getKSTDate();
  const dateStr = `${kst.getFullYear()}년 ${kst.getMonth() + 1}월 ${kst.getDate()}일`;
  const stocks = newsData.map((n) => n.stock).join(", ");

  let message = `[입력 데이터]\n`;
  message += `날짜: ${dateStr}\n`;
  message += `유저 관심 종목: ${stocks}\n\n`;

  message += `[전반적 경제 뉴스]\n`;
  if (economicNews.length === 0) {
    message += `경제 뉴스가 없습니다.\n\n`;
  } else {
    for (const article of economicNews) {
      message += `${article.title}: ${article.description}\n`;
    }
    message += "\n";
  }

  message += `[종목별 뉴스 데이터]\n\n`;

  for (const { stock, articles } of newsData) {
    message += `${stock}\n`;
    if (articles.length === 0) {
      message += `관련 뉴스가 없습니다. 대체 로직을 적용해주세요.\n\n`;
    } else {
      for (const article of articles.slice(0, 5)) {
        message += `${article.title}: ${article.description}\n`;
      }
      message += "\n";
    }
  }

  return message;
}

// === 공통 규칙 (TTS 최적화 + 사실 검증) ===
const SHARED_RULES = `[TTS 음성 출력 최적화]
이 스크립트는 AI TTS 엔진이 그대로 읽어서 음성으로 출력합니다.

문장 길이: 한 문장은 40자 이내로 짧게 끊으세요. 쉼표를 적극 활용해 자연스러운 호흡을 만드세요.
기호 사용 금지: * ** ## " - ( ) % $ / 등 모든 특수기호 및 마크다운 절대 사용 금지
숫자와 단위: 숫자는 아라비아 숫자 그대로, % → "퍼센트", $ → "달러", 환율은 "1507원", "7.3원 상승" 형태. "7원 30전" 같은 전 단위 금지. 3.50 → 3.5
영어 약자: IPO→기업공개, ETF→상장지수펀드, EPS→주당순이익, PER→주가수익비율, GDP→국내총생산, CPI→소비자물가지수
포맷: 마크다운 서식 절대 금지. 순수 텍스트만.

[시점 표현]
제공된 뉴스는 어제부터 오늘 아침까지 발행된 기사입니다. "오늘"이 아닌 자연스러운 표현을 사용하세요. 예: "어제", "지난밤", "최근" 등.

[사실 검증 필수]
스크립트는 반드시 제공된 실제 뉴스 데이터만을 근거로 작성하세요.
절대 금지: 제공된 뉴스에 없는 수치/실적/전망 지어내기, 과거 학습 데이터 의존, 기술명/제품명 임의 해석.
뉴스 데이터가 부족하면 없는 내용을 만들어내지 마세요.

[출력 형식]
반드시 아래 JSON 형식으로만 응답하세요. JSON 외의 텍스트는 절대 포함하지 마세요.
{ "script": "스크립트 텍스트", "glossary": [{ "term": "용어명", "definition": "한 줄 설명" }] }
용어 사전: 스크립트에 등장하는 금융 전문 용어 중 초보자가 모를 만한 것 최대 5개. 너무 쉬운 용어 제외.`;

// === 공통 스크립트 (오프닝 + 경제 요약) ===
const COMMON_SYSTEM_PROMPT = `당신은 주식 초보자(주린이)들에게 친절하고 쉽게 경제 이슈를 전달하는 20년차 경제 브리핑 앵커입니다.

오프닝 인사와 전반적 경제 이슈 요약만 작성하세요.

[구성]
1. 오프닝 인사 (70자 내외): "안녕하세요, {MM}월 {DD}일 피트스탁 브리핑을 시작하겠습니다."
2. 전반적 경제 이슈 요약 (250~300자):
   - 지수 숫자, 등락률 같은 단순 수치 나열 금지. 주린이는 이미 증권 앱에서 봤습니다.
   - "왜 시장이 이렇게 움직였는지" 원인과 배경을 설명하세요.
   - 투자자에게 어떤 의미인지, 어떤 점을 주의해야 하는지 맥락을 전달하세요.

총 글자 수: 공백 포함 320~370자

${SHARED_RULES}`;

// === 종목별 스크립트 ===
const STOCK_SYSTEM_PROMPT = `당신은 주식 초보자(주린이)들에게 친절하고 쉽게 주식 이슈를 전달하는 20년차 경제 브리핑 앵커겸 애널리스트입니다.

하나의 종목에 대한 브리핑 스크립트만 작성하세요.

[뉴스 선별 기준]
1순위: 실적 발표, 매출/영업이익 변동, 인수합병, 대규모 수주/계약 등 주가에 직접 영향을 주는 이슈
2순위: 해당 종목이 속한 섹터 전체에 영향을 미치는 산업 뉴스
3순위: 환율, 금리, 지수 등 해당 종목에 영향을 주는 거시경제 뉴스

절대 사용 금지 (이 목록에 해당하는 기사는 내용이 아무리 좋아 보여도 스크립트에 절대 포함하지 마세요):
- 제품 출시, 신제품, 앱 출시, 서비스 론칭 기사 (매출 핵심인 경우만 예외)
- 이벤트, 채용, 사회공헌, 마케팅 캠페인 등 비금융 활동
- 환경, ESG, 탄소중립, 나무심기, 조림, 녹색사업, 친환경 캠페인, 봉사활동, 기부, 장학금, 문화행사 등 CSR 활동 전부
- 증권사 목표주가 숫자만 바뀐 단순 기사 (단, 애널리스트의 분석 근거나 업황 전망이 포함된 리포트 기사는 사용 가능)
- 추측성 기사, 매수/매도 권유, 광고성 보도자료

[대체 로직] 해당 종목의 뉴스가 없으면:
1단계: 같은 섹터 다른 종목 뉴스로 섹터 동향 연결
2단계: 거시경제 뉴스와 해당 종목 연관성 설명
3단계: 위 방법 모두 불가하면 "오늘은 {종목명} 관련 특별한 이슈가 확인되지 않았습니다"라고 짧게 언급. 분량 부족해도 OK.
절대 금지: 근거 없는 "안정적", "긍정적", "회복세" 등 전망 표현.

[종목 매칭 주의] 종목명이 유사한 다른 기업 뉴스 혼동 금지.

[시장 데이터 활용]
시장 데이터가 제공되면 스크립트에 자연스럽게 녹여 사용하세요.
- "어제 2.3퍼센트 하락한 7만 2천원에 마감했습니다" 처럼 가격/등락률을 자연어로 표현
- 외국인/기관 매매 동향이 있으면 수급 흐름을 언급 ("외국인이 연속 매도세를 보이고 있습니다")
- 시장 데이터는 팩트이므로 그대로 활용 가능. 단, 수치를 나열하지 말고 맥락과 함께 전달
- 시장 데이터가 없으면 뉴스만으로 작성

[구성] "{종목명} 소식입니다." 그리고 핵심 이슈 1~2개, 한 줄 요약.

[분량 기준] 뉴스 양에 따라 유동적으로 조절하세요. (공백 포함)
- 해당 종목 뉴스 없음 (섹터/거시경제 연결): 200~350자
- 해당 종목 뉴스 1~2개: 350~500자
- 해당 종목 뉴스 3개 이상: 500~900자
뉴스가 없다고 내용을 지어내지 마세요. 대신 섹터 동향이나 거시경제 맥락을 연결해주세요.
핵심 이슈를 깊이 있게 분석하세요. 단순 사실 나열이 아니라, 왜 중요한지, 투자자에게 어떤 의미인지 맥락을 전달하세요.

${SHARED_RULES}`;

// === 클로징 스크립트 ===
const CLOSING_SYSTEM_PROMPT = `당신은 주식 초보자(주린이)들에게 친절한 경제 브리핑 앵커입니다.

브리핑 마무리 멘트만 작성하세요.

[구성]
- 현재 경제 상황에서 주린이에게 도움이 되는 일반적인 투자 태도/마인드셋 조언
- "매수하세요"/"팔아야 합니다"/"오를 것 같습니다"/"지금이 기회입니다"/특정 종목 추천 절대 금지
- 권장 주제: 분산 투자, 장기적 관점, 감정적 판단 지양 등
- 마지막 문장은 반드시: "본 브리핑은 투자 참고용이며, 투자 판단과 책임은 본인에게 있습니다. 오늘도 현명한 하루 되세요."

총 글자 수: 공백 포함 100~120자

${SHARED_RULES}`;

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
  return new Anthropic({ apiKey });
}

function parseScriptResult(text: string): ScriptResult {
  try {
    const raw = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(raw);
    return { script: parsed.script, glossary: parsed.glossary ?? [] };
  } catch {
    return { script: text, glossary: [] };
  }
}

async function callClaude(systemPrompt: string, userMessage: string): Promise<ScriptResult> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude API");
  }
  return parseScriptResult(textBlock.text);
}

// 공통 스크립트 생성 (오프닝 + 경제 요약)
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

  return callClaude(COMMON_SYSTEM_PROMPT, message);
}

// 종목별 스크립트 생성
export async function generateStockScript(
  stock: string,
  stockNews: StockNews,
  allNewsContext: StockNews[],
  economicNews: NewsItem[],
  marketDataText?: string,
): Promise<ScriptResult> {
  let message = `[대상 종목] ${stock}\n\n`;

  // 시장 데이터 (한국투자증권 API)
  if (marketDataText) {
    message += `${marketDataText}\n`;
  }

  message += `[${stock} 뉴스]\n`;
  if (stockNews.articles.length === 0) {
    message += `관련 뉴스가 없습니다. 대체 로직을 적용해주세요.\n`;
  } else {
    for (const article of stockNews.articles.slice(0, 10)) {
      message += `${article.title}: ${article.description}\n`;
    }
  }

  // 대체 로직용 다른 종목 컨텍스트
  const otherStocks = allNewsContext.filter((n) => n.stock !== stock && n.articles.length > 0);
  if (otherStocks.length > 0) {
    message += `\n[참고: 다른 종목 뉴스 (대체 로직용)]\n`;
    for (const { stock: s, articles } of otherStocks) {
      message += `${s}: ${articles.slice(0, 2).map((a) => a.title).join(", ")}\n`;
    }
  }

  if (economicNews.length > 0) {
    message += `\n[참고: 경제 뉴스 (대체 로직용)]\n`;
    for (const article of economicNews.slice(0, 5)) {
      message += `${article.title}\n`;
    }
  }

  return callClaude(STOCK_SYSTEM_PROMPT, message);
}

// 클로징 스크립트 생성
export async function generateClosingScript(): Promise<ScriptResult> {
  const kst = getKSTDate();
  const dateStr = `${kst.getFullYear()}년 ${kst.getMonth() + 1}월 ${kst.getDate()}일`;
  return callClaude(CLOSING_SYSTEM_PROMPT, `날짜: ${dateStr}\n마무리 멘트를 작성해주세요.`);
}

// 기존 호환: 전체 스크립트 한번에 생성 (폴백용)
export async function generateScript(newsData: StockNews[], economicNews: NewsItem[] = []): Promise<ScriptResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserMessage(newsData, economicNews),
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude API");
  }

  try {
    const raw = textBlock.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(raw);
    return { script: parsed.script, glossary: parsed.glossary ?? [] };
  } catch {
    return { script: textBlock.text, glossary: [] };
  }
}
