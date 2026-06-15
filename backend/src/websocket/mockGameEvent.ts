import type { GameEvent } from "../events/gameEvent.js";

// 실제 KBO 데이터 수집이나 Kafka 연동 전, WebSocket → Chrome Extension 표시 흐름만 확인하기 위한 고정 이벤트
export const createMockGameEvent = (): GameEvent => {
  return {
    gameId: "2026-06-12-LG-DOO",
    inning: 7,
    inningHalf: "TOP",
    homeTeam: "DOO",
    awayTeam: "LG",
    homeScore: 3,
    awayScore: 5,
    outCount: 1,
    eventType: "SCORE",
    message: "LG 7회초 1득점",

    // 서버에서 이벤트를 보낸 시점을 ISO 문자열로 기록
    timestamp: new Date().toISOString(),
  };
};