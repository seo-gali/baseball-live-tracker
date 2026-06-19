const WS_URL = "ws://localhost:4000";

const SELECTED_TEAM_STORAGE_KEY = "baseball-live-tracker:selected-team";
const LEGACY_FAVORITE_TEAM_STORAGE_KEY = "baseball-live-tracker.favorite-team";

// Backend에서 내려주는 KBO 경기 상태 값을 Popup 표시용 한글 문구로 변환
const GAME_STATUS_LABELS = {
  SCHEDULED: "경기전",
  LIVE: "진행중",
  FINAL: "경기종료",
  CANCELED: "취소",
  UNKNOWN: "상태 확인중",
};

// select value와 KBO HTML 팀명을 같은 기준으로 비교하기 위한 팀명 매핑
// Popup select value는 영어 표기, KBO 스코어보드는 일부 팀을 한글로 제공
const TEAM_NAME_ALIASES = {
  LG: "LG",
  KT: "KT",
  SSG: "SSG",
  NC: "NC",
  KIA: "KIA",

  DOO: "DOOSAN",
  OB: "DOOSAN",
  두산: "DOOSAN",
  DOOSAN: "DOOSAN",

  SAM: "SAMSUNG",
  삼성: "SAMSUNG",
  SAMSUNG: "SAMSUNG",

  LOT: "LOTTE",
  롯데: "LOTTE",
  LOTTE: "LOTTE",

  HAN: "HANWHA",
  한화: "HANWHA",
  HANWHA: "HANWHA",

  KIW: "KIWOOM",
  키움: "KIWOOM",
  KIWOOM: "KIWOOM",
};

// Popup에서 사용하는 DOM 요소를 한 곳에서 관리
const dom = {
  favoriteTeam: document.querySelector("#favorite-team"),

  gameSummary: document.querySelector(".game-summary"),
  rankInfo: document.querySelector(".rank-info"),

  gameStatus: document.querySelector("#game-status"),
  gameDate: document.querySelector("#game-date"),

  awayTeam: document.querySelector("#away-team"),
  awayScore: document.querySelector("#away-score"),
  homeTeam: document.querySelector("#home-team"),
  homeScore: document.querySelector("#home-score"),

  stadium: document.querySelector("#stadium"),
  gameTime: document.querySelector("#game-time"),

  battingTeam: document.querySelector("#batting-team"),
  ballStrikeCount: document.querySelector("#ball-strike-count"),
  outCount: document.querySelector("#out-count"),

  baseState: document.querySelector("#base-state"),
  firstBase: document.querySelector('[data-base="first"]'),
  secondBase: document.querySelector('[data-base="second"]'),
  thirdBase: document.querySelector('[data-base="third"]'),

  selectedRank: document.querySelector("#selected-rank"),
  selectedRecord: document.querySelector("#selected-record"),
  selectedRate: document.querySelector("#selected-rate"),

  gameListSection: document.querySelector("#game-list-section"),
  gameList: document.querySelector("#game-list"),

  statusDot: document.querySelector("#status-dot"),
  connectionText: document.querySelector("#connection-text"),
};

// Popup 런타임 상태
const state = {
  socket: null,
  selectedTeam: "",
  latestKboSnapshot: null,
};

// 팀명 비교 전에 앞뒤 공백을 제거하고 alias를 표준 select value로 변환
const normalizeTeamName = (teamName) => {
  const normalized = String(teamName ?? "").trim();

  return TEAM_NAME_ALIASES[normalized] || normalized;
};

// 점수 값 표시
// 경기전 상태에서는 Backend가 0으로 내려줄 수 있고, 값이 없으면 "-"로 표시
const formatScore = (score) => {
  if (score === null || score === undefined || score === "") {
    return "-";
  }

  return String(score);
};

// 이닝 초/말 값을 Popup 표시용 한글로 변환
const formatInningHalf = (inningHalf) => {
  if (inningHalf === "TOP") {
    return "초";
  }

  if (inningHalf === "BOTTOM") {
    return "말";
  }

  return "";
};

// 경기 상태 표시값 생성
// inning / inningHalf가 있으면 "9회초"처럼 우선 표시
const formatGameStatus = (game) => {
  if (game?.inning && game?.inningHalf) {
    return `${game.inning}회${formatInningHalf(game.inningHalf)}`;
  }

  const gameStatus = game?.gameStatus;

  return GAME_STATUS_LABELS[gameStatus] || gameStatus || "-";
};

// 공격 팀 표시값 계산
// battingTeam이 있으면 우선 사용하고, 없으면 inningHalf 기준으로 계산
const getBattingTeam = (game) => {
  if (!game) {
    return null;
  }

  if (game.battingTeam) {
    return game.battingTeam;
  }

  if (game.inningHalf === "TOP") {
    return game.awayTeam;
  }

  if (game.inningHalf === "BOTTOM") {
    return game.homeTeam;
  }

  return null;
};

// 주자 점유 상태에 따라 각 루 다이아몬드의 색상을 갱신
const renderBaseState = (baseState) => {
  const hasBaseState = Boolean(baseState);

  dom.baseState.classList.toggle("unknown", !hasBaseState);

  dom.firstBase.classList.toggle(
    "occupied",
    Boolean(baseState?.first),
  );

  dom.secondBase.classList.toggle(
    "occupied",
    Boolean(baseState?.second),
  );

  dom.thirdBase.classList.toggle(
    "occupied",
    Boolean(baseState?.third),
  );

  if (!hasBaseState) {
    dom.baseState.setAttribute("aria-label", "주자 정보 없음");
    return;
  }

  const occupiedBases = [];

  if (baseState.first) {
    occupiedBases.push("1루");
  }

  if (baseState.second) {
    occupiedBases.push("2루");
  }

  if (baseState.third) {
    occupiedBases.push("3루");
  }

  dom.baseState.setAttribute(
    "aria-label",
    occupiedBases.length > 0
      ? `주자 ${occupiedBases.join(", ")}`
      : "주자 없음",
  );
};


// localStorage에서 선택 팀 값 읽어오기
// 새 key가 없으면 기존 key를 한 번 읽어서 마이그레이션
const loadSelectedTeam = () => {
  try {
    const savedTeam = localStorage.getItem(SELECTED_TEAM_STORAGE_KEY);

    if (savedTeam !== null) {
      return normalizeTeamName(savedTeam);
    }

    const legacyTeam = localStorage.getItem(LEGACY_FAVORITE_TEAM_STORAGE_KEY);

    if (legacyTeam !== null) {
      return normalizeTeamName(legacyTeam);
    }

    return "";
  } catch {
    return "";
  }
};

// 선택 팀 값을 localStorage에 저장
const saveSelectedTeam = (team) => {
  try {
    localStorage.setItem(SELECTED_TEAM_STORAGE_KEY, team);
  } catch {
    // localStorage 사용이 실패해도 Popup 동작은 계속 유지
  }
};

// WebSocket 연결 상태 UI를 갱신
// CSS는 data-status 또는 class 둘 다 대응할 수 있게 둘 다 갱신
const setConnectionState = (status, message) => {
  dom.statusDot.dataset.status = status;

  dom.statusDot.classList.remove(
    "connecting",
    "connected",
    "disconnected",
    "error",
  );

  dom.statusDot.classList.add(status);
  dom.connectionText.textContent = message;
};

// 선택 팀 화면을 표시하고 전체 경기 목록은 숨기기
const showSelectedTeamView = () => {
  dom.gameSummary.classList.remove("hidden");
  dom.rankInfo.classList.remove("hidden");
  dom.gameListSection.classList.add("hidden");
};

// 전체 경기 목록을 표시하고 선택 팀 카드는 숨기기
const showAllGamesView = () => {
  dom.gameSummary.classList.add("hidden");
  dom.rankInfo.classList.add("hidden");
  dom.gameListSection.classList.remove("hidden");
};

// 경기 정보가 아직 없을 때 점수판 영역을 초기 상태로 생성
const renderEmptyGame = (statusText = "수집 대기") => {
  dom.gameStatus.textContent = statusText;
  dom.gameDate.textContent = "-";

  dom.awayTeam.textContent = "-";
  dom.awayScore.textContent = "-";
  dom.homeTeam.textContent = "-";
  dom.homeScore.textContent = "-";

  dom.stadium.textContent = "-";
  dom.gameTime.textContent = "-";

  dom.battingTeam.textContent = "-";
  dom.ballStrikeCount.textContent = "-";
  dom.outCount.textContent = "-";

  renderBaseState(null);
};

// 순위 정보가 아직 없을 때 순위 영역을 초기 상태로 생성
const renderEmptyRank = () => {
  dom.selectedRank.textContent = "-";
  dom.selectedRecord.textContent = "-";
  dom.selectedRate.textContent = "-";
};

// 선택 팀이 없는 경우 기본 화면 상태
const renderNoSelectedTeamState = () => {
  renderEmptyGame("수집 대기");
  renderEmptyRank();
  showAllGamesView();
};

// 현재 선택 팀이 포함된 경기 찾기
const findSelectedGame = (scoreboardGames, selectedTeam) => {
  const normalizedSelectedTeam = normalizeTeamName(selectedTeam);

  return (
    scoreboardGames.find((game) => {
      return (
        normalizeTeamName(game.awayTeam) === normalizedSelectedTeam ||
        normalizeTeamName(game.homeTeam) === normalizedSelectedTeam
      );
    }) ?? null
  );
};

// 현재 선택 팀의 순위 정보 찾기
const findSelectedRank = (teamRanks, selectedTeam) => {
  const normalizedSelectedTeam = normalizeTeamName(selectedTeam);

  return (
    teamRanks.find((teamRank) => {
      return normalizeTeamName(teamRank.teamName) === normalizedSelectedTeam;
    }) ?? null
  );
};

// 볼과 스트라이크 값이 모두 있으면 "3-2" 형식으로 표시
const formatBallStrikeCount = (game) => {
  if (
    !Number.isInteger(game?.ballCount) ||
    !Number.isInteger(game?.strikeCount)
  ) {
    return "-";
  }

  return `${game.ballCount}-${game.strikeCount}`;
};

// 선택 팀이 포함된 경기 정보를 화면에 표시
const renderSelectedGame = (game) => {
  showSelectedTeamView();

  if (!game) {
    renderEmptyGame("오늘 경기 없음");
    return;
  }

  dom.gameStatus.textContent = formatGameStatus(game);
  dom.gameDate.textContent = game.gameDate || "-";

  dom.awayTeam.textContent = game.awayTeam || "-";
  dom.awayScore.textContent = formatScore(game.awayScore);

  dom.homeTeam.textContent = game.homeTeam || "-";
  dom.homeScore.textContent = formatScore(game.homeScore);

  dom.stadium.textContent = game.stadium || "-";
  dom.gameTime.textContent = game.gameTime || "-";

  const battingTeam = getBattingTeam(game);

  dom.battingTeam.textContent = battingTeam || "-";

  dom.ballStrikeCount.textContent =
    formatBallStrikeCount(game);

  dom.outCount.textContent =
    Number.isInteger(game.outCount)
      ? `${game.outCount} Out`
      : "-";

  renderBaseState(game.baseState);
};

// 선택 팀의 시즌 순위 정보를 화면에 표시
const renderSelectedRank = (teamRank) => {
  if (!teamRank) {
    renderEmptyRank();
    return;
  }

  dom.selectedRank.textContent = `${teamRank.rank}위`;
  dom.selectedRecord.textContent =
    `${teamRank.wins}승 ${teamRank.losses}패 ${teamRank.draws}무`;
  dom.selectedRate.textContent =
    `${teamRank.winningRate} / ${teamRank.gamesBehind}`;
};

// 선택 팀이 없는 경우 전체 경기 목록을 표시
const renderAllGames = (scoreboardGames) => {
  showAllGamesView();

  dom.gameList.innerHTML = "";

  if (!scoreboardGames.length) {
    const item = document.createElement("li");

    item.className = "empty-text";
    item.textContent = "표시할 경기 정보가 없습니다.";

    dom.gameList.appendChild(item);
    return;
  }

  for (const game of scoreboardGames) {
    const item = document.createElement("li");

    item.className = "game-list-item";
    item.innerHTML = `
      <div class="game-list-title">
        <span>${game.awayTeam} ${formatScore(game.awayScore)} - ${formatScore(game.homeScore)} ${game.homeTeam}</span>
        <strong class="game-list-score">${formatGameStatus(game)}</strong>
      </div>
      <div class="game-list-meta">${game.stadium || "-"} ${game.gameTime || "-"}</div>
    `;

    dom.gameList.appendChild(item);
  }
};

// Backend에서 받은 KBO_SNAPSHOT을 기준으로 화면 전체 갱신
const renderKboSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== "object") {
    state.latestKboSnapshot = null;
    renderEmptyGame();
    renderEmptyRank();
    return;
  }

  state.latestKboSnapshot = snapshot;

  const scoreboardGames = Array.isArray(snapshot.scoreboardGames)
    ? snapshot.scoreboardGames
    : [];

  const teamRanks = Array.isArray(snapshot.teamRanks) ? snapshot.teamRanks : [];

  const selectedTeam = dom.favoriteTeam.value;

  state.selectedTeam = normalizeTeamName(selectedTeam);

  if (!state.selectedTeam) {
    renderAllGames(scoreboardGames);
    return;
  }

  const selectedGame = findSelectedGame(scoreboardGames, state.selectedTeam);
  const selectedRank = findSelectedRank(teamRanks, state.selectedTeam);

  renderSelectedGame(selectedGame);
  renderSelectedRank(selectedRank);
};

// GAME_EVENT가 들어왔을 때 latestKboSnapshot의 해당 경기만 보정
const applyGameEventToLatestSnapshot = (event) => {
  if (!state.latestKboSnapshot) {
    return;
  }

  const scoreboardGames = Array.isArray(state.latestKboSnapshot.scoreboardGames)
    ? state.latestKboSnapshot.scoreboardGames
    : [];

  state.latestKboSnapshot.scoreboardGames = scoreboardGames.map((game) => {
    if (game.gameId !== event.gameId) {
      return game;
    }

    return {
      ...game,
      awayTeam: event.awayTeam ?? game.awayTeam,
      homeTeam: event.homeTeam ?? game.homeTeam,
      awayScore: event.awayScore ?? game.awayScore,
      homeScore: event.homeScore ?? game.homeScore,
      gameStatus:
        event.eventType === "GAME_END"
          ? "FINAL"
          : event.gameStatus ?? game.gameStatus,
      inning: event.inning ?? game.inning,
      inningHalf: event.inningHalf ?? game.inningHalf,
      outCount: event.outCount ?? game.outCount,
    };
  });
};


// Popup에서 선택한 응원 팀을 WebSocket Server에 전달
// 선택 팀이 없는 경우 빈 문자열을 전송
const sendSelectedTeam = () => {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return;
  }

  state.socket.send(
    JSON.stringify({
      type: "SUBSCRIBE_TEAM",
      payload: {
        team: dom.favoriteTeam.value,
      },
    }),
  );
};

// WebSocket Server에서 받은 메시지 타입에 따라 처리
// KBO_SNAPSHOT은 화면 전체 갱신, GAME_EVENT는 최신 snapshot 보정에 사용
const handleSocketMessage = (message) => {
  if (
    message.type === "KBO_SNAPSHOT" ||
    message.type === "SCOREBOARD_SNAPSHOT" ||
    message.type === "KBO_COLLECTED_DATA"
  ) {
    renderKboSnapshot(message.payload);
    return;
  }

  if (message.type === "GAME_EVENT") {
    applyGameEventToLatestSnapshot(message.payload);

    if (state.latestKboSnapshot) {
      renderKboSnapshot(state.latestKboSnapshot);
    }
  }
};

// WebSocket Server에 연결
// 연결이 끊기면 3초 뒤 재연결
const connectWebSocket = () => {
  setConnectionState("connecting", "WebSocket 연결 중");

  const socket = new WebSocket(WS_URL);

  state.socket = socket;

  socket.addEventListener("open", () => {
    setConnectionState("connected", "WebSocket 연결 완료");
    sendSelectedTeam();
  });

  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data);

      handleSocketMessage(message);
    } catch (error) {
      console.error("[popup] failed to parse websocket message", error);
    }
  });

  socket.addEventListener("close", () => {
    setConnectionState("disconnected", "WebSocket 연결 종료");

    window.setTimeout(() => {
      connectWebSocket();
    }, 3000);
  });

  socket.addEventListener("error", () => {
    setConnectionState("error", "WebSocket 오류");
  });
};

// 응원 팀 select 변경 시 저장값을 갱신하고,
// 이미 받은 snapshot이 있으면 같은 데이터에서 선택 팀 기준으로 다시 렌더링
const handleSelectedTeamChange = (event) => {
  const selectedTeam = normalizeTeamName(event.target.value);

  state.selectedTeam = selectedTeam;
  dom.favoriteTeam.value = selectedTeam;

  saveSelectedTeam(selectedTeam);
  sendSelectedTeam();

  if (state.latestKboSnapshot) {
    renderKboSnapshot(state.latestKboSnapshot);
    return;
  }

  if (!selectedTeam) {
    renderNoSelectedTeamState();
    return;
  }

  renderEmptyGame();
  renderEmptyRank();
  showSelectedTeamView();
};

// Popup 초기화
// 저장된 선택 팀을 select에 반영하고 WebSocket 연결 시작
const initializePopup = () => {
  const selectedTeam = loadSelectedTeam();

  state.selectedTeam = selectedTeam;
  dom.favoriteTeam.value = selectedTeam;

  saveSelectedTeam(selectedTeam);

  renderNoSelectedTeamState();

  dom.favoriteTeam.addEventListener("change", handleSelectedTeamChange);

  connectWebSocket();
};

initializePopup();