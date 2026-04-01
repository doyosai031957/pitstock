/**
 * 규칙/코드 변경 이력
 *
 * 프롬프트, 뉴스 수집, 검증 규칙 등을 변경할 때마다 여기에 한 줄 추가.
 * 히스토리 패널에서 "이 브리핑이 어떤 규칙으로 생성됐는지" 확인 가능.
 */

export interface RuleChange {
  version: string;       // 시맨틱 버전 (예: "2.1.0")
  date: string;          // YYYY-MM-DD
  changes: string[];     // 변경 내역 (한글, 짧게)
}

export const RULE_CHANGELOG: RuleChange[] = [
  {
    version: "2.4.0",
    date: "2026-04-01",
    changes: [
      "temperature 0.3 + response_format: json_object 적용 (창의적 filler 억제, JSON 파싱 안정화)",
      "검증 강화: 정규식 패턴 추가 (긍정적인 영향, 순매수 X주, 거래량 X주 등 수치 나열)",
      "검증 강화: 용어 사전 script 혼입 감지, 뻔한 마무리 패턴 대폭 추가",
      "종목 프롬프트: 거래량/순매수 수치 나열 명시적 금지, 비금융 뉴스 무시 목록 확대",
      "종목 프롬프트: 마지막 문장을 뉴스 팩트로 끝내라는 규칙 추가",
    ],
  },
  {
    version: "2.3.0",
    date: "2026-04-01",
    changes: [
      "프롬프트 대폭 축소: GPT가 규칙을 무시하는 문제 해결 (시스템 프롬프트 ~100줄 → ~40줄)",
      "뉴스 감정 해석 금지 규칙 추가: 호재/악재 판단은 GPT가 하지 않고 팩트만 전달",
      "검증 레이어: '요약하자면', '종합해보면' 등 마무리 요약 패턴 → error (자동 재생성)",
      "검증 레이어: '앞으로 주시', '주목할 만한' 등 filler 표현 → error (자동 재생성)",
      "경제 요약 프롬프트: 지수/수급/글로벌 증시 핵심 중심으로 재구성",
    ],
  },
  {
    version: "2.2.0",
    date: "2026-04-01",
    changes: [
      "뉴스 수집: 8개 접미사 쿼리 → 종목명 단일 쿼리 200건 수집으로 단순화",
      "증권/주식 관련 기사 필터링 키워드 화이트리스트 추가 (48개 키워드)",
      "종목 스크립트 '요약하자면' 마무리 요약 문장 금지",
      "종목 스크립트 최소 분량 500자 필수",
      "종목별 뉴스 GPT 전달량 15건 → 30건 확대",
      "종목 스크립트: 정보 나열 → 스토리텔링 방식 스타일 가이드 추가",
      "시장 데이터(KIS) 수치가 뉴스 수치보다 정확함을 명시, 수치 우선순위 지정",
    ],
  },
  {
    version: "2.1.0",
    date: "2026-04-01",
    changes: [
      "종목 스크립트: 공통 브리핑 내용 반복 금지 (코스피/환율 등 지수 중복 제거)",
      "종목 스크립트 글자수 상한 확대: 900→1200자 (뉴스 분석 공간 확보)",
      "뉴스 인용 필수 규칙 추가: 3건+ 뉴스 시 최소 2건 구체적 인용 강제",
      "시세 데이터만으로 스크립트 채우기 금지 (좋은 예/나쁜 예 명시)",
    ],
  },
  {
    version: "2.0.0",
    date: "2026-04-01",
    changes: [
      "프롬프트 전면 개편: 절대 규칙 최상단 배치, 체크리스트 형식",
      "뉴스 수집 쿼리 5→8개 확장 (영업이익, 인수합병, 공시)",
      "종목별 뉴스 슬라이스 10→15건",
      "경제 뉴스: 종목 뉴스 3건 미만일 때만 주입",
      "시장 데이터 라벨 수정: '어제 마감' → '오늘 기준 실시간'",
      "검증 레이어 추가: Layer A (규칙) + Layer B (gpt-4o-mini)",
      "Layer A 에러 시 자동 1회 재생성",
      "Google TTS 제거, Naver Clova 단일화",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-03-30",
    changes: [
      "초기 버전: 기본 프롬프트, 뉴스 수집, KIS API 연동",
    ],
  },
];

/** 현재 적용 중인 규칙 버전 */
export const CURRENT_RULE_VERSION = RULE_CHANGELOG[0].version;

/** 현재 버전의 변경 내역 */
export function getCurrentRuleInfo(): RuleChange {
  return RULE_CHANGELOG[0];
}

/** 두 버전 사이의 변경 내역 */
export function getChangesBetween(fromVersion: string, toVersion: string): RuleChange[] {
  const fromIdx = RULE_CHANGELOG.findIndex((c) => c.version === fromVersion);
  const toIdx = RULE_CHANGELOG.findIndex((c) => c.version === toVersion);
  if (fromIdx === -1 || toIdx === -1) return [];
  const [start, end] = fromIdx > toIdx ? [toIdx, fromIdx] : [fromIdx, toIdx];
  return RULE_CHANGELOG.slice(start, end + 1);
}
