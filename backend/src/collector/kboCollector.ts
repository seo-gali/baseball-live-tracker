import { load } from "cheerio";

import { getKboCollectorConfig } from "../config/kboConfig.js";
import type { GameEvent, InningHalf } from "../events/gameEvent.js";
import { publishGameEvent } from "../producer/gameEventProducer.js";

import type {
  KboCollectedData,
  KboGameStatus,
  KboScoreboardGame,
  KboTeamLineScore,
  KboTeamRank,
} from "./kboTypes.js";

// 스코어보드 변경 감지를 위해 이전 수집 결과를 메모리에 보관
// 서버 재시작 시 초기화되어도 되는 Phase 8용 단순 상태 저장 방식
const previousScoreboardGames = new Map<string, KboScoreboardGame>();

// HTML 텍스트에서 불필요한 공백과 줄바꿈을 제거
const normalizeText = (value: string): string => {
  return value.replace(/\s+/g, " ").trim();
};

// 숫자 문자열을 number로 변환
// "-", 빈 문자열, 숫자가 아닌 값은 null로 처리
const parseNullableNumber = (value: string): number | null => {
  const normalized = normalizeText(value).replaceAll(",", "");

  if (!normalized || normalized === "-") {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
};

// 필수 숫자 필드를 number로 변환
// 값이 없거나 숫자가 아니면 null을 반환해 호출부에서 해당 row 제외
const parseRequiredNumber = (value: string): number | null => {
  return parseNullableNumber(value);
};

// KBO 날짜 문자열을 내부 날짜 포맷으로 변환
// 예: 2026.06.18(목) → 2026-06-18
// 예: 20260618 → 2026-06-18
// 예: 2026-06-18 → 2026-06-18
const parseKboDate = (value: string): string | null => {
  const dottedDate = value.match(/(\d{4})\.(\d{2})\.(\d{2})/);

  if (dottedDate) {
    const [, year, month, day] = dottedDate;
    return `${year}-${month}-${day}`;
  }

  const dashedDate = value.match(/(\d{4})-(\d{2})-(\d{2})/);

  if (dashedDate) {
    const [, year, month, day] = dashedDate;
    return `${year}-${month}-${day}`;
  }

  const compactDate = value.match(/(\d{4})(\d{2})(\d{2})/);

  if (compactDate) {
    const [, year, month, day] = compactDate;
    return `${year}-${month}-${day}`;
  }

  return null;
};

// collectedAt 기준 한국 날짜를 yyyy-mm-dd 형식으로 만든다.
const formatKstDate = (collectedAt: string): string => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(collectedAt));
};

// KBO 스코어보드 HTML에서 날짜 후보 문자열을 찾는다.
const findScoreboardDateText = (html: string): string | null => {
  const patterns = [
    /lblGameDate[^>]*>\s*([^<]+)\s*</i,
    /hfSearchDate[^>]*value=["']([^"']+)["']/i,
    /value=["']([^"']+)["'][^>]*hfSearchDate/i,
    /txtGameDate[^>]*value=["']([^"']+)["']/i,
    /value=["']([^"']+)["'][^>]*txtGameDate/i,
    /(\d{4}\.\d{2}\.\d{2})/,
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{8})/,
  ];

  for (const pattern of patterns) {
    const matched = html.match(pattern);

    if (matched?.[1]) {
      return matched[1];
    }
  }

  return null;
};

// 스코어보드 날짜를 결정한다.
// HTML에서 날짜를 못 찾으면 Collector 실행 시점의 KST 날짜를 사용한다.
const resolveScoreboardDate = (
  html: string,
  collectedAt: string,
): string => {
  const dateText = findScoreboardDateText(html);
  const parsedDate = parseKboDate(dateText ?? "");

  if (parsedDate) {
    return parsedDate;
  }

  const fallbackDate = formatKstDate(collectedAt);

  console.warn(
    `[kbo-collector] scoreboard date not found. fallbackDate=${fallbackDate}`,
  );

  return fallbackDate;
};

// 경기별 REVIEW 링크에서 gameId 값을 추출한다.
const extractSourceGameId = (href: string | undefined): string | null => {
  if (!href) {
    return null;
  }

  const matched = href.match(/[?&]gameId=([^&]+)/i);

  if (!matched?.[1]) {
    return null;
  }

  return decodeURIComponent(matched[1]);
};

// 내부 gameId는 KBO 페이지의 gameId query parameter를 우선 사용한다.
// 경기전처럼 gameId가 없으면 날짜와 원정/홈 팀으로 생성한다.
const createGameId = (
  gameDate: string,
  awayTeam: string,
  homeTeam: string,
  sourceGameId: string | null,
): string => {
  if (sourceGameId) {
    return sourceGameId;
  }

  return `${gameDate.replaceAll("-", "")}-${awayTeam}-${homeTeam}`;
};

// 스코어보드의 경기 상태 텍스트를 내부 경기 상태 값으로 변환한다.
const parseGameStatus = (value: string): KboGameStatus => {
  const status = normalizeText(value).toUpperCase();

  if (status.includes("FINAL") || status.includes("경기종료") || status === "종료") {
    return "FINAL";
  }

  if (status.includes("CANCEL") || status.includes("취소")) {
    return "CANCELED";
  }

  if (status.includes("예정") || status.includes("경기전")) {
    return "SCHEDULED";
  }

  if (status.includes("LIVE") || status.includes("진행") || /\d+회/.test(status)) {
    return "LIVE";
  }

  return "UNKNOWN";
};

// place 텍스트에서 구장과 경기 시간을 분리
// 예: 잠실 18:30 → stadium=잠실, gameTime=18:30
const parseLocalTime = (
  value: string,
): {
  stadium: string;
  gameTime: string;
} => {
  const normalized = normalizeText(value);
  const parts = normalized.split(" ").filter(Boolean);

  if (parts.length < 2) {
    return {
      stadium: normalized,
      gameTime: "",
    };
  }

  const gameTime = parts.at(-1) ?? "";
  const stadium = parts.slice(0, -1).join(" ");

  return {
    stadium,
    gameTime,
  };
};

// 승/패/세 또는 W/L/S prefix를 제거한다.
const removePitcherPrefix = (value: string): string | null => {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const withoutPrefix = normalized
    .replace(/^(승|패|세|W|L|S)\s*[:：]\s*/i, "")
    .trim();

  return withoutPrefix || null;
};

// p.win 내부 span 목록에서 승리/패전/세이브 투수 텍스트를 찾는다.
const findPitcherTextByPrefixes = (
  pitcherTexts: string[],
  prefixes: string[],
): string | null => {
  const found = pitcherTexts.find((pitcherText) => {
    const normalized = normalizeText(pitcherText);

    return prefixes.some((prefix) => normalized.startsWith(prefix));
  });

  if (!found) {
    return null;
  }

  return removePitcherPrefix(found);
};

// KBO HTML 조회
// 실제 URL은 kboConfig.ts에서 읽어온 값을 호출부에서 넘긴다.
const fetchHtml = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; BaseballLiveTracker/0.1; local-learning-project)",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`KBO request failed. status=${response.status}, url=${url}`);
  }

  return response.text();
};

// 스코어보드 테이블의 한 팀 row를 KboTeamLineScore로 변환
// KBO tScore는 마지막 4개 td를 R/H/E/B로 사용한다.
// 경기전 상태에서는 R/H/E/B가 비어 있으므로 runs는 0으로 처리한다.
const parseLineScore = (
  team: string,
  cells: string[],
  gameStatus: KboGameStatus,
): KboTeamLineScore | null => {
  if (cells.length < 5) {
    return null;
  }

  const runsIndex = cells.length - 4;
  const hitsIndex = cells.length - 3;
  const errorsIndex = cells.length - 2;
  const basesOnBallsIndex = cells.length - 1;

  const inningScores = cells.slice(0, runsIndex).map(parseNullableNumber);
  const parsedRuns = parseNullableNumber(cells[runsIndex] ?? "");

  const canUseEmptyRuns =
    gameStatus === "SCHEDULED" || gameStatus === "CANCELED";

  const runs = parsedRuns ?? (canUseEmptyRuns ? 0 : null);

  if (runs === null) {
    return null;
  }

  return {
    team,
    inningScores,
    runs,
    hits: parseNullableNumber(cells[hitsIndex] ?? ""),
    errors: parseNullableNumber(cells[errorsIndex] ?? ""),
    basesOnBalls: parseNullableNumber(cells[basesOnBallsIndex] ?? ""),
  };
};

// KBO 스코어보드 HTML을 경기 목록으로 변환
const parseScoreboard = (
  html: string,
  collectedAt: string,
): KboScoreboardGame[] => {
  const $ = load(html);

  const gameDate = resolveScoreboardDate(html, collectedAt);
  const games: KboScoreboardGame[] = [];

  $(".smsScore").each((_index, element) => {
    const gameBlock = $(element);
    const scoreWrap = gameBlock.find(".score_wrap").first();

    const awayTeam = normalizeText(
      scoreWrap.find(".leftTeam .teamT").first().text(),
    );

    const homeTeam = normalizeText(
      scoreWrap.find(".rightTeam .teamT").first().text(),
    );

    const awayScoreText =
      normalizeText(scoreWrap.find(".leftTeam .score span").first().text()) ||
      normalizeText(scoreWrap.find(".leftTeam .score").first().text()) ||
      normalizeText(gameBlock.find("span[id*='lblAwayTeamScore']").first().text());

    const homeScoreText =
      normalizeText(scoreWrap.find(".rightTeam .score span").first().text()) ||
      normalizeText(scoreWrap.find(".rightTeam .score").first().text()) ||
      normalizeText(gameBlock.find("span[id*='lblHomeTeamScore']").first().text());

    const awayScoreFromHeader = parseNullableNumber(awayScoreText);
    const homeScoreFromHeader = parseNullableNumber(homeScoreText);

    const gameStatus = parseGameStatus(scoreWrap.find(".flag").first().text());

    const { stadium, gameTime } = parseLocalTime(
      gameBlock.find(".place").first().text(),
    );

    const pitcherTexts = gameBlock
      .find(".win span")
      .toArray()
      .map((pitcherText) => normalizeText($(pitcherText).text()));

    const winningPitcherText = findPitcherTextByPrefixes(pitcherTexts, [
      "승:",
      "승：",
      "W:",
      "W：",
    ]);

    const losingPitcherText = findPitcherTextByPrefixes(pitcherTexts, [
      "패:",
      "패：",
      "L:",
      "L：",
    ]);

    const savePitcherText = findPitcherTextByPrefixes(pitcherTexts, [
      "세:",
      "세：",
      "S:",
      "S：",
    ]);

    const sourceGameId = extractSourceGameId(
      gameBlock.find(".btnSms a[href*='gameId=']").first().attr("href"),
    );

    const tableRows = gameBlock.find("table.tScore tbody tr").toArray();
    const awayRowElement = tableRows[0];
    const homeRowElement = tableRows[1];

    if (
      !awayTeam ||
      !homeTeam ||
      !stadium ||
      !gameTime ||
      !awayRowElement ||
      !homeRowElement
    ) {
      console.warn("[kbo-collector] skipped invalid scoreboard game row", {
        awayTeam,
        homeTeam,
        stadium,
        gameTime,
        hasAwayRow: Boolean(awayRowElement),
        hasHomeRow: Boolean(homeRowElement),
      });

      return;
    }

    const awayRow = $(awayRowElement);
    const homeRow = $(homeRowElement);

    const awayLineScore = parseLineScore(
      normalizeText(awayRow.find("th[scope='row']").first().text()) || awayTeam,
      awayRow
        .find("td")
        .toArray()
        .map((cell) => normalizeText($(cell).text())),
      gameStatus,
    );

    const homeLineScore = parseLineScore(
      normalizeText(homeRow.find("th[scope='row']").first().text()) || homeTeam,
      homeRow
        .find("td")
        .toArray()
        .map((cell) => normalizeText($(cell).text())),
      gameStatus,
    );

    if (!awayLineScore || !homeLineScore) {
      console.warn("[kbo-collector] skipped invalid line score", {
        awayTeam,
        homeTeam,
        gameStatus,
        awayScoreText,
        homeScoreText,
      });

      return;
    }

    const awayScore = awayScoreFromHeader ?? awayLineScore.runs;
    const homeScore = homeScoreFromHeader ?? homeLineScore.runs;

    games.push({
      gameId: createGameId(gameDate, awayTeam, homeTeam, sourceGameId),
      gameDate,
      gameTime,
      stadium,
      awayTeam,
      homeTeam,
      awayScore,
      homeScore,
      awayLineScore,
      homeLineScore,
      gameStatus,
      winningPitcherText,
      losingPitcherText,
      savePitcherText,
      collectedAt,
    });
  });

  return games;
};

// KBO 팀 순위 HTML을 팀 순위 목록으로 변환
const parseTeamRank = (html: string): KboTeamRank[] => {
  const $ = load(html);
  const teamRanks: KboTeamRank[] = [];

  // 팀 순위 페이지에는 팀 순위표와 팀간 승패표가 모두 table.tData로 존재한다.
  // summary에 순위/팀명/승률이 들어간 팀 순위표만 사용한다.
  const teamRankTable = $("table.tData")
    .filter((_index, element) => {
      const summary = normalizeText($(element).attr("summary") ?? "");

      return (
        summary.includes("순위") &&
        summary.includes("팀명") &&
        summary.includes("승률")
      );
    })
    .first();

  if (teamRankTable.length === 0) {
    console.warn("[kbo-collector] team rank table not found");
    return teamRanks;
  }

  teamRankTable.find("tbody tr").each((_index, element) => {
    const cells = $(element)
      .find("td")
      .toArray()
      .map((cell) => normalizeText($(cell).text()));

    if (cells.length < 12) {
      console.warn("[kbo-collector] skipped invalid team rank row", {
        cells,
      });

      return;
    }

    const rank = parseRequiredNumber(cells[0] ?? "");
    const teamName = cells[1] ?? "";
    const games = parseRequiredNumber(cells[2] ?? "");
    const wins = parseRequiredNumber(cells[3] ?? "");
    const losses = parseRequiredNumber(cells[4] ?? "");
    const draws = parseRequiredNumber(cells[5] ?? "");
    const winningRate = parseRequiredNumber(cells[6] ?? "");
    const gamesBehind = cells[7] ?? "";

    if (
      rank === null ||
      !teamName ||
      games === null ||
      wins === null ||
      losses === null ||
      draws === null ||
      winningRate === null ||
      !gamesBehind
    ) {
      console.warn("[kbo-collector] skipped invalid team rank row", {
        rank,
        teamName,
        games,
        wins,
        losses,
        draws,
        winningRate,
        gamesBehind,
      });

      return;
    }

    teamRanks.push({
      rank,
      teamName,
      games,
      wins,
      losses,
      draws,
      winningRate,
      gamesBehind,
      recentTenGames: cells[8] ?? "",
      streak: cells[9] ?? "",
      homeRecord: cells[10] ?? "",
      awayRecord: cells[11] ?? "",
    });
  });

  return teamRanks;
};

// 득점이 발생한 이닝을 이닝별 점수 차이로 보조 식별
const findScoringInning = (
  previousScores: Array<number | null>,
  currentScores: Array<number | null>,
): number | null => {
  const maxLength = Math.max(previousScores.length, currentScores.length);

  for (let index = 0; index < maxLength; index += 1) {
    const previousScore = previousScores[index] ?? 0;
    const currentScore = currentScores[index] ?? 0;

    if (currentScore > previousScore) {
      return index + 1;
    }
  }

  return null;
};

// 득점 이벤트 생성
const createScoreEvent = (
  previousGame: KboScoreboardGame,
  currentGame: KboScoreboardGame,
  scoringTeamType: "AWAY" | "HOME",
): GameEvent => {
  const isAwayScored = scoringTeamType === "AWAY";

  const previousScore = isAwayScored
    ? previousGame.awayScore
    : previousGame.homeScore;

  const currentScore = isAwayScored
    ? currentGame.awayScore
    : currentGame.homeScore;

  const scoringTeam = isAwayScored ? currentGame.awayTeam : currentGame.homeTeam;
  const scoreDiff = currentScore - previousScore;

  const inning = isAwayScored
    ? findScoringInning(
        previousGame.awayLineScore.inningScores,
        currentGame.awayLineScore.inningScores,
      )
    : findScoringInning(
        previousGame.homeLineScore.inningScores,
        currentGame.homeLineScore.inningScores,
      );

  const inningHalf: InningHalf | null = inning
    ? isAwayScored
      ? "TOP"
      : "BOTTOM"
    : null;

  return {
    gameId: currentGame.gameId,
    inning,
    inningHalf,
    homeTeam: currentGame.homeTeam,
    awayTeam: currentGame.awayTeam,
    homeScore: currentGame.homeScore,
    awayScore: currentGame.awayScore,
    outCount: null,
    eventType: "SCORE",
    message: `${scoringTeam} ${scoreDiff}득점, 현재 ${currentGame.awayTeam} ${currentGame.awayScore} - ${currentGame.homeScore} ${currentGame.homeTeam}`,
    timestamp: new Date().toISOString(),
  };
};

// 경기 종료 이벤트 생성
const createGameEndEvent = (currentGame: KboScoreboardGame): GameEvent => {
  return {
    gameId: currentGame.gameId,
    inning: null,
    inningHalf: null,
    homeTeam: currentGame.homeTeam,
    awayTeam: currentGame.awayTeam,
    homeScore: currentGame.homeScore,
    awayScore: currentGame.awayScore,
    outCount: null,
    eventType: "GAME_END",
    message: `${currentGame.awayTeam} ${currentGame.awayScore} - ${currentGame.homeScore} ${currentGame.homeTeam} 경기 종료`,
    timestamp: new Date().toISOString(),
  };
};

// Collector 실패를 Kafka로 전달하기 위한 ERROR 이벤트 생성
const createErrorEvent = (error: unknown): GameEvent => {
  const errorMessage =
    error instanceof Error ? error.message : "Unknown KBO collector error";

  return {
    gameId: "KBO-COLLECTOR-ERROR",
    inning: null,
    inningHalf: null,
    homeTeam: "UNKNOWN",
    awayTeam: "UNKNOWN",
    homeScore: 0,
    awayScore: 0,
    outCount: null,
    eventType: "ERROR",
    message: `KBO Collector 오류: ${errorMessage}`,
    timestamp: new Date().toISOString(),
  };
};

// 이전 스코어보드 상태와 현재 상태를 비교해 GameEvent 목록 생성
const createGameEventsFromScoreboardGames = (
  currentGames: KboScoreboardGame[],
): GameEvent[] => {
  const events: GameEvent[] = [];

  for (const currentGame of currentGames) {
    const previousGame = previousScoreboardGames.get(currentGame.gameId);

    if (!previousGame) {
      previousScoreboardGames.set(currentGame.gameId, currentGame);
      continue;
    }

    if (currentGame.awayScore > previousGame.awayScore) {
      events.push(createScoreEvent(previousGame, currentGame, "AWAY"));
    }

    if (currentGame.homeScore > previousGame.homeScore) {
      events.push(createScoreEvent(previousGame, currentGame, "HOME"));
    }

    if (
      previousGame.gameStatus !== "FINAL" &&
      currentGame.gameStatus === "FINAL"
    ) {
      events.push(createGameEndEvent(currentGame));
    }

    previousScoreboardGames.set(currentGame.gameId, currentGame);
  }

  return events;
};

// KBO 스코어보드와 팀 순위를 한 번 수집
export const collectKboData = async (): Promise<KboCollectedData> => {
  const { scoreboardUrl, teamRankUrl } = getKboCollectorConfig();

  const collectedAt = new Date().toISOString();

  const scoreboardHtml = await fetchHtml(scoreboardUrl);
  const scoreboardGames = parseScoreboard(scoreboardHtml, collectedAt);

  let teamRanks: KboTeamRank[] = [];

  try {
    const teamRankHtml = await fetchHtml(teamRankUrl);
    teamRanks = parseTeamRank(teamRankHtml);
  } catch (error) {
    console.error("[kbo-collector] failed to collect team ranks", error);
  }

  return {
    collectedAt,
    scoreboardGames,
    teamRanks,
  };
};

// KBO 데이터를 수집하고 스코어보드 기반 GameEvent를 Kafka로 발행
// WebSocket snapshot 전송을 위해 수집 결과도 호출부로 반환
export const collectAndPublishKboEvents =
  async (): Promise<KboCollectedData | null> => {
    let collectedData: KboCollectedData;

    try {
      collectedData = await collectKboData();
    } catch (error) {
      console.error("[kbo-collector] failed to collect scoreboard", error);

      await publishGameEvent(createErrorEvent(error));
      return null;
    }

    console.log(
      `[kbo-collector] scoreboard games collected: ${collectedData.scoreboardGames.length}`,
    );

    console.log(
      `[kbo-collector] team ranks collected: ${collectedData.teamRanks.length}`,
    );

    const events = createGameEventsFromScoreboardGames(
      collectedData.scoreboardGames,
    );

    for (const event of events) {
      await publishGameEvent(event);
    }

    return collectedData;
  };