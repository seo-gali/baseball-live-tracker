// TOP: 초, BOTTOM: 말
export type InningHalf = "TOP" | "BOTTOM";

// 백엔드 내부에서 사용할 경기 이벤트 타입 목록
export type GameEventType =
  | "GAME_START"
  | "GAME_END"
  | "SCORE"
  | "HOME_RUN"
  | "OUT_COUNT_CHANGE"
  | "PITCHER_CHANGE"
  | "BATTER_CHANGE"
  | "INNING_CHANGE"
  | "ERROR";

// Kafka와 WebSocket을 통해 전달할 경기 이벤트 표준 구조
export type GameEvent = {
  // 경기 식별자
  gameId: string;

  // 현재 이닝
  // KBO 스코어보드에서 확정할 수 없으면 null
  inning: number | null;

  // 초 / 말 구분
  // KBO 스코어보드에서 확정할 수 없으면 null
  inningHalf: InningHalf | null;

  // 홈 팀
  homeTeam: string;

  // 원정 팀
  awayTeam: string;

  // 홈 팀 점수
  homeScore: number;

  // 원정 팀 점수
  awayScore: number;

  // 현재 아웃카운트
  // KBO 스코어보드에서 제공하지 않으므로 실제 Collector에서는 null
  outCount: number | null;

  // 경기 이벤트 타입
  eventType: GameEventType;

  // Popup에 표시할 사용자 메시지
  message: string;

  // 이벤트 생성 시각
  timestamp: string;
};