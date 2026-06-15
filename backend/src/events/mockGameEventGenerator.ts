import type { GameEvent } from "./gameEvent.js";

// Mock 이벤트 시나리오에서는 timestamp만 매번 새로 생성
// 나머지 경기 상태 값은 고정된 시나리오 데이터로 관리
type MockGameEventTemplate = Omit<GameEvent, "timestamp">;

// Mock 경기 이벤트를 생성할 주기.
// WebSocket Server에서 setInterval 기준값으로 사용
export const MOCK_GAME_EVENT_INTERVAL_MS = 3000;

// 실제 KBO 데이터 연동 전까지는 하나의 가상 경기만 재생
const MOCK_GAME_ID = "2026-06-15-LG-DOO";

// WebSocket으로 순차 전송할 Mock 경기 이벤트 시나리오.
// 실제 경기 흐름처럼 경기 시작 → 아웃 변경 → 득점 → 이닝 변경 → 경기 종료 순서로 구성
const MOCK_GAME_EVENT_SEQUENCE: MockGameEventTemplate[] = [
  {
    gameId: MOCK_GAME_ID,
    inning: 1,
    inningHalf: "TOP",
    homeTeam: "DOO",
    awayTeam: "LG",
    homeScore: 0,
    awayScore: 0,
    outCount: 0,
    eventType: "GAME_START",
    message: "경기 시작: LG vs DOO",
  },
  {
    gameId: MOCK_GAME_ID,
    inning: 1,
    inningHalf: "TOP",
    homeTeam: "DOO",
    awayTeam: "LG",
    homeScore: 0,
    awayScore: 0,
    outCount: 1,
    eventType: "OUT_COUNT_CHANGE",
    message: "LG 1회초 1아웃",
  },
  {
    gameId: MOCK_GAME_ID,
    inning: 1,
    inningHalf: "TOP",
    homeTeam: "DOO",
    awayTeam: "LG",
    homeScore: 0,
    awayScore: 1,
    outCount: 1,
    eventType: "SCORE",
    message: "LG 1회초 선취 득점",
  },
  {
    gameId: MOCK_GAME_ID,
    inning: 1,
    inningHalf: "BOTTOM",
    homeTeam: "DOO",
    awayTeam: "LG",
    homeScore: 0,
    awayScore: 1,
    outCount: 0,
    eventType: "INNING_CHANGE",
    message: "1회말 시작",
  },
  {
    gameId: MOCK_GAME_ID,
    inning: 2,
    inningHalf: "BOTTOM",
    homeTeam: "DOO",
    awayTeam: "LG",
    homeScore: 2,
    awayScore: 1,
    outCount: 1,
    eventType: "HOME_RUN",
    message: "DOO 2회말 역전 투런 홈런",
  },
  {
    gameId: MOCK_GAME_ID,
    inning: 5,
    inningHalf: "TOP",
    homeTeam: "DOO",
    awayTeam: "LG",
    homeScore: 2,
    awayScore: 1,
    outCount: 0,
    eventType: "PITCHER_CHANGE",
    message: "DOO 투수 교체",
  },
  {
    gameId: MOCK_GAME_ID,
    inning: 7,
    inningHalf: "TOP",
    homeTeam: "DOO",
    awayTeam: "LG",
    homeScore: 2,
    awayScore: 3,
    outCount: 2,
    eventType: "SCORE",
    message: "LG 7회초 2득점 역전",
  },
  {
    gameId: MOCK_GAME_ID,
    inning: 8,
    inningHalf: "BOTTOM",
    homeTeam: "DOO",
    awayTeam: "LG",
    homeScore: 3,
    awayScore: 3,
    outCount: 1,
    eventType: "SCORE",
    message: "DOO 8회말 동점 득점",
  },
  {
    gameId: MOCK_GAME_ID,
    inning: 9,
    inningHalf: "TOP",
    homeTeam: "DOO",
    awayTeam: "LG",
    homeScore: 3,
    awayScore: 4,
    outCount: 2,
    eventType: "SCORE",
    message: "LG 9회초 결승 득점",
  },
  {
    gameId: MOCK_GAME_ID,
    inning: 9,
    inningHalf: "BOTTOM",
    homeTeam: "DOO",
    awayTeam: "LG",
    homeScore: 3,
    awayScore: 4,
    outCount: 3,
    eventType: "GAME_END",
    message: "경기 종료: LG 4 - 3 DOO",
  },
];

// 고정 시나리오 template에 현재 시각 timestamp를 붙여 실제 GameEvent를 생성
const createEventWithTimestamp = (template: MockGameEventTemplate): GameEvent => {
  return {
    ...template,
    timestamp: new Date().toISOString(),
  };
};

// Mock 경기 이벤트 생성기의 외부 공개 인터페이스.
// WebSocket Server는 이 인터페이스만 사용해 다음 이벤트 생성, 초기화, 현재 위치 확인 수행
export type MockGameEventGenerator = {
  next: () => GameEvent;
  reset: () => void;
  getCurrentIndex: () => number;
};

// Mock 경기 이벤트 생성기 factory.
// 내부 currentIndex를 closure로 관리해서 외부에서 직접 수정 불가
export const createMockGameEventGenerator = (): MockGameEventGenerator => {
  // 다음에 전송할 Mock 이벤트의 배열 index.
  let currentIndex = 0;

  return {
    // 현재 index의 이벤트를 GameEvent로 생성한 뒤,  다음 호출을 위해 index를 한 칸 이동
    // 마지막 이벤트 이후에는 다시 첫 이벤트부터 반복
    next: () => {
      const template = MOCK_GAME_EVENT_SEQUENCE[currentIndex];

      currentIndex = (currentIndex + 1) % MOCK_GAME_EVENT_SEQUENCE.length;

      return createEventWithTimestamp(template);
    },

    // Mock 경기 시나리오를 처음부터 다시 재생할 수 있도록 index를 초기화
    // 모든 WebSocket 클라이언트가 끊어진 뒤 재연결되었을 때 사용
    reset: () => {
      currentIndex = 0;
    },

    // 현재 generator가 다음에 반환할 이벤트 index를 확인
    // 필수 기능은 아니지만 디버깅이나 테스트에서 사용 가능
    getCurrentIndex: () => {
      return currentIndex;
    },
  };
};