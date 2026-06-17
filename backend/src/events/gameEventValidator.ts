import type { GameEvent, GameEventType, InningHalf } from "./gameEvent.js";

// Consumer에서 최소 구조 검증을 하기 위해 허용 가능한 inningHalf 값을 배열로 관리
const INNING_HALVES: readonly InningHalf[] = ["TOP", "BOTTOM"];

// backend/src/events/gameEvent.ts에 정의된 GameEventType과 동일한 값 목록
const GAME_EVENT_TYPES: readonly GameEventType[] = [
  "GAME_START",
  "GAME_END",
  "SCORE",
  "HOME_RUN",
  "OUT_COUNT_CHANGE",
  "PITCHER_CHANGE",
  "BATTER_CHANGE",
  "INNING_CHANGE",
  "ERROR",
];

// unknown 값이 null이 아닌 object인지 확인
// JSON.parse 결과를 바로 Record로 단정하지 않기 위한 guard
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

// inningHalf가 "TOP" 또는 "BOTTOM"인지 확인
const isInningHalf = (value: unknown): value is InningHalf => {
  return typeof value === "string" && INNING_HALVES.includes(value as InningHalf);
};

// inningHalf가 "TOP", "BOTTOM", null 중 하나인지 확인
// KBO 스코어보드에서는 초/말을 항상 확정할 수 없으므로 null을 허용한다.
const isNullableInningHalf = (value: unknown): value is InningHalf | null => {
  return value === null || isInningHalf(value);
};

// 정수 또는 null인지 확인
// KBO 스코어보드에서는 inning, outCount를 항상 확정할 수 없으므로 null을 허용한다.
const isNullableInteger = (value: unknown): value is number | null => {
  return value === null || Number.isInteger(value);
};

// eventType이 GameEventType 목록에 포함되는지 확인
const isGameEventType = (value: unknown): value is GameEventType => {
  return (
    typeof value === "string" &&
    GAME_EVENT_TYPES.includes(value as GameEventType)
  );
};

// Kafka message value를 GameEvent로 사용해도 되는지 런타임에서 검증
export const isGameEvent = (value: unknown): value is GameEvent => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.gameId === "string" &&
    isNullableInteger(value.inning) &&
    isNullableInningHalf(value.inningHalf) &&
    typeof value.homeTeam === "string" &&
    typeof value.awayTeam === "string" &&
    Number.isInteger(value.homeScore) &&
    Number.isInteger(value.awayScore) &&
    isNullableInteger(value.outCount) &&
    isGameEventType(value.eventType) &&
    typeof value.message === "string" &&
    typeof value.timestamp === "string"
  );
};

// Kafka message.value(Buffer | null)를 GameEvent로 변환
export const parseGameEventMessageValue = (
  messageValue: Buffer | null,
): GameEvent | null => {
  if (!messageValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(messageValue.toString());

    if (!isGameEvent(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};