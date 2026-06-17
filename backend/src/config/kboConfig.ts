// KBO Collector가 사용할 설정 타입
export type KboCollectorConfig = {
  // KBO 스코어보드 HTML 조회 URL
  scoreboardUrl: string;

  // KBO 팀 순위 HTML 조회 URL
  teamRankUrl: string;

  // KBO Collector polling 간격(ms)
  collectorIntervalMs: number;
};

// 필수 환경변수 값을 읽고 비어 있는지 확인
const getRequiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
};

// 환경변수로 받은 값이 올바른 URL 형식인지 확인
const parseUrl = (value: string, name: string): string => {
  try {
    new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  return value;
};

// KBO Collector polling interval 환경변수를 number로 변환
const parseCollectorIntervalMs = (value: string): number => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new Error("KBO_COLLECTOR_INTERVAL_MS must be an integer");
  }

  if (parsed < 30_000) {
    throw new Error(
      "KBO_COLLECTOR_INTERVAL_MS must be greater than or equal to 30000",
    );
  }

  return parsed;
};

// KBO Collector 관련 설정을 환경변수에서만 읽어온다.
export const getKboCollectorConfig = (): KboCollectorConfig => {
  return {
    scoreboardUrl: parseUrl(
      getRequiredEnv("KBO_SCOREBOARD_URL"),
      "KBO_SCOREBOARD_URL",
    ),
    teamRankUrl: parseUrl(
      getRequiredEnv("KBO_TEAM_RANK_URL"),
      "KBO_TEAM_RANK_URL",
    ),
    collectorIntervalMs: parseCollectorIntervalMs(
      getRequiredEnv("KBO_COLLECTOR_INTERVAL_MS"),
    ),
  };
};