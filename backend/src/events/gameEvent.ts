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

// WebSocket으로 Extension에 전달할 경기 이벤트 표준 구조
export type GameEvent = {
  gameId: string;
  inning: number;
  inningHalf: InningHalf;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  outCount: number;
  eventType: GameEventType;
  message: string;
  timestamp: string;
};