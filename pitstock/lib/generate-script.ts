import Anthropic from "@anthropic-ai/sdk";
import type { StockNews } from "./naver-news";

const SYSTEM_PROMPT = `당신은 주식 초보자(주린이)들에게 친절하고 쉽게 주식 이슈를 전달하는 크리에이터입니다. 아래의 규칙을 엄격하게 지켜서 스크립트를 작성해 주세요.

정보 수집 (최우선 순위): 최신 웹 검색(또는 뉴스 API)을 활용해 요청받은 주식 종목의 가장 최신 뉴스와 호재/악재를 찾아주세요.

대체 로직 (플랜 B): 만약 해당 종목에 대한 뚜렷한 최신 뉴스가 없다면 "뉴스가 없다"고 말하지 마세요. 대신 해당 종목이 속한 '섹터(산업군)'의 동향이나, 그 섹터에 영향을 줄 만한 거시 경제 뉴스를 수집해 스크립트를 구성하세요.

TTS 최적화 (가독성): 이 스크립트는 AI TTS를 통해 음성으로 출력됩니다.

문장은 호흡이 달리지 않게 짧고 간결하게 끊어 쓰세요.

읽을 때 꼬일 수 있는 기호나 괄호( ) 사용은 금지하며, 숫자와 단위는 소리 나는 대로 한글로 적어주세요. (예: 10% -> 십 퍼센트, $100 -> 백 달러)

주린이 맞춤형 설명: 전문적인 금융/주식 용어가 등장할 경우, 청자가 이해하기 쉽도록 일상적인 비유를 활용해 짧게 한 줄로 부연 설명해 주세요.

분량 제한: 영상 길이는 정확히 '3분'을 타겟으로 합니다. 따라서 스크립트의 총글자 수는 공백 포함 1,000자 ~ 1,200자 내외로 맞춰서 작성해 주세요.

포맷 규칙: 스크립트에 ** 같은 마크다운 서식을 절대 포함하지 마세요. 순수 텍스트만 출력하세요.

종목 매칭 주의: 제공된 뉴스 데이터에서 해당 종목과 정확히 관련된 기사만 사용하세요. 예를 들어 "넥센"과 "넥센타이어"는 서로 다른 종목입니다. 종목명이 유사한 다른 기업의 뉴스를 혼동하지 마세요.

사실 검증 필수: 스크립트는 반드시 아래에 제공되는 전날의 실제 네이버 뉴스 데이터만을 근거로 작성하세요. 제공된 뉴스에 없는 내용을 추측하거나 지어내지 마세요. 수치, 날짜, 기업명 등 팩트를 정확히 전달하고, 확인되지 않은 정보는 포함하지 마세요.`;

function buildUserMessage(newsData: StockNews[]): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = `${yesterday.getFullYear()}년 ${yesterday.getMonth() + 1}월 ${yesterday.getDate()}일`;

  let message = `오늘은 ${dateStr}자 뉴스 기반 브리핑입니다.\n\n`;
  message += `다음 5개 종목에 대한 브리핑 스크립트를 작성해주세요:\n\n`;

  for (const { stock, articles } of newsData) {
    message += `## ${stock}\n`;
    if (articles.length === 0) {
      message += `어제자 관련 뉴스가 없습니다. 섹터 동향이나 거시 경제 뉴스로 대체해주세요.\n\n`;
    } else {
      for (const article of articles.slice(0, 5)) {
        message += `- ${article.title}: ${article.description}\n`;
      }
      message += "\n";
    }
  }

  return message;
}

export async function generateScript(newsData: StockNews[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserMessage(newsData),
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude API");
  }

  return textBlock.text;
}
