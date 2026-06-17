const WS_URL = "ws://localhost:4000";
const FAVORITE_TEAM_STORAGE_KEY = "baseball-live-tracker.favorite-team";

// Backend에서 내려주는 KBO 경기 상태 값을 Popup 표시용 한글 문구로 변환
const GAME_STATUS_LABELS = {
  SCHEDULED: "경기전",
  LIVE: "진행중",
  FINAL: "경기종료",
  CANCELED: "취소",
  UNKNOWN: "상태 확인중",
};

// 현재 KBO Collector는 KBO HTML의 팀명 값을 그대로 사용하므로 한글 팀명으로 보정
const TEAM_VALUE_ALIASES = {
  DOO: "두산",
  SAM: "삼성",
  LOT: "롯데",
  HAN: "한화",
  KIW: "키움",
};

// Popup에서 사용하는 DOM 요소를 한 곳에서 관리
const dom = {
  favoriteTeam: document.querySelector("#favorite-team"),

  gameStatus: document.querySelector("#game-status"),
  gameDate: document.querySelector("#game-date"),

  awayTeam: document.querySelector("#away-team"),
  awayScore: document.querySelector("#away-score"),
  homeTeam: document.querySelector("#home-team"),
  homeScore: document.querySelector("#home-score"),

  stadium: document.querySelector("#stadium"),
  gameTime: document.querySelector("#game-time"),

  selectedRank: document.querySelector("#selected-rank"),
  selectedRecord: document.querySelector("#selected-record"),
  selectedRate: document.querySelector("#selected-rate"),

  statusDot: document.querySelector("#status-dot"),
  connectionText: document.querySelector("#connection-text"),
};

// 팀명 비교 전에 앞뒤 공백을 제거
// KBO HTML에서 가져온 팀명과 select value를 같은 기준으로 비교하기 위한 함수
const normalizeTeamName = (teamName) => {
  return String(teamName ?? "").trim();
};

// localStorage에 저장된 이전 팀 value를 현재 KBO Collector 팀명 기준으로 변환
const normalizeFavoriteTeamValue = (teamName) => {
  const normalized = normalizeTeamName(teamName);

  return TEAM_VALUE_ALIASES[normalized] || normalized || "KT";
};

// Popup 런타임 상태.
// latestSnapshot은 Backend가 보내는 KBO_SNAPSHOT payload를 저장
const state = {
  socket: null,
  favoriteTeam: normalizeFavoriteTeamValue(
    localStorage.getItem(FAVORITE_TEAM_STORAGE_KEY),
  ),
  latestSnapshot: null,
};

// 점수 값 표시.
// 경기전 상태에서는 Backend가 0으로 내려주고, 값이 없으면 "-"로 표시
const formatScore = (score) => {
  if (score === null || score === undefined) {
    return "-";
  }

  return String(score);
};

// Backend 경기 상태 값을 화면 표시용 문구로 변환
const formatGameStatus = (gameStatus) => {
  return GAME_STATUS_LABELS[gameStatus] || gameStatus || "-";
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

// 현재 선택한 응원 팀이 포함된 경기 찾기
// scoreboardGames는 Backend KBO_SNAPSHOT의 scoreboardGames 배열
const findFavoriteGame = (scoreboardGames) => {
  const favoriteTeam = normalizeTeamName(state.favoriteTeam);

  return scoreboardGames.find((game) => {
    return (
      normalizeTeamName(game.awayTeam) === favoriteTeam ||
      normalizeTeamName(game.homeTeam) === favoriteTeam
    );
  });
};

// 현재 선택한 응원 팀의 순위 정보 찾기
// teamRanks는 Backend KBO_SNAPSHOT의 teamRanks 배열
const findFavoriteTeamRank = (teamRanks) => {
  const favoriteTeam = normalizeTeamName(state.favoriteTeam);

  return teamRanks.find((teamRank) => {
    return normalizeTeamName(teamRank.teamName) === favoriteTeam;
  });
};

// 경기 정보가 아직 없을 때 점수판 영역을 초기 상태로 생성
const renderEmptyGame = () => {
  dom.gameStatus.textContent = "수집 대기";
  dom.gameDate.textContent = "-";

  dom.awayTeam.textContent = "-";
  dom.awayScore.textContent = "-";
  dom.homeTeam.textContent = "-";
  dom.homeScore.textContent = "-";

  dom.stadium.textContent = "-";
  dom.gameTime.textContent = "-";
};

// 순위 정보가 아직 없을 때 순위 영역을 초기 상태로 생성
const renderEmptyRank = () => {
  dom.selectedRank.textContent = "-";
  dom.selectedRecord.textContent = "-";
  dom.selectedRate.textContent = "-";
};

// 선택 팀이 포함된 경기 정보를 화면에 표시
const renderGame = (game) => {
  if (!game) {
    renderEmptyGame();
    dom.gameStatus.textContent = "경기 없음";
    return;
  }

  dom.gameStatus.textContent = formatGameStatus(game.gameStatus);
  dom.gameDate.textContent = game.gameDate || "-";

  dom.awayTeam.textContent = game.awayTeam || "-";
  dom.awayScore.textContent = formatScore(game.awayScore);

  dom.homeTeam.textContent = game.homeTeam || "-";
  dom.homeScore.textContent = formatScore(game.homeScore);

  dom.stadium.textContent = game.stadium || "-";
  dom.gameTime.textContent = game.gameTime || "-";
};

// 선택 팀의 시즌 순위 정보를 화면에 표시
const renderRank = (teamRank) => {
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

// Backend에서 받은 KBO_SNAPSHOT을 기준으로 화면 전체를 갱신
const renderSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== "object") {
    renderEmptyGame();
    renderEmptyRank();
    return;
  }

  state.latestSnapshot = snapshot;

  const scoreboardGames = Array.isArray(snapshot.scoreboardGames)
    ? snapshot.scoreboardGames
    : [];

  const teamRanks = Array.isArray(snapshot.teamRanks) ? snapshot.teamRanks : [];

  const favoriteGame = findFavoriteGame(scoreboardGames);
  const favoriteTeamRank = findFavoriteTeamRank(teamRanks);

  renderGame(favoriteGame);
  renderRank(favoriteTeamRank);
};

// Kafka 기반 GAME_EVENT가 들어왔을 때 선택 팀 경기만 반영
// 실시간 득점 이벤트가 오면 기존 snapshot의 경기 정보 위에 점수만 갱신
const renderGameEvent = (event) => {
  const favoriteTeam = normalizeTeamName(state.favoriteTeam);

  const isFavoriteGame =
    normalizeTeamName(event.awayTeam) === favoriteTeam ||
    normalizeTeamName(event.homeTeam) === favoriteTeam;

  if (!isFavoriteGame) {
    return;
  }

  const latestGames = Array.isArray(state.latestSnapshot?.scoreboardGames)
    ? state.latestSnapshot.scoreboardGames
    : [];

  const baseGame = findFavoriteGame(latestGames);

  renderGame({
    ...baseGame,
    gameStatus: "LIVE",
    awayTeam: event.awayTeam,
    homeTeam: event.homeTeam,
    awayScore: event.awayScore,
    homeScore: event.homeScore,
  });
};

// Popup에서 선택한 응원 팀을 WebSocket Server에 전달
// 현재 Backend는 이 값을 로그와 snapshot replay 트리거로 사용
const sendTeamSubscription = () => {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return;
  }

  state.socket.send(
    JSON.stringify({
      type: "SUBSCRIBE_TEAM",
      payload: {
        team: state.favoriteTeam,
      },
    }),
  );
};

// WebSocket Server에서 받은 메시지 타입에 따라 처리
// KBO_SNAPSHOT은 화면 전체 갱신, GAME_EVENT는 실시간 점수 갱신에 사용
const handleSocketMessage = (message) => {
  if (
    message.type === "KBO_SNAPSHOT" ||
    message.type === "SCOREBOARD_SNAPSHOT" ||
    message.type === "KBO_COLLECTED_DATA"
  ) {
    renderSnapshot(message.payload);
    return;
  }

  if (message.type === "GAME_EVENT") {
    renderGameEvent(message.payload);
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
    sendTeamSubscription();
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
const handleFavoriteTeamChange = () => {
  state.favoriteTeam = normalizeFavoriteTeamValue(dom.favoriteTeam.value);
  localStorage.setItem(FAVORITE_TEAM_STORAGE_KEY, state.favoriteTeam);

  if (state.latestSnapshot) {
    renderSnapshot(state.latestSnapshot);
  } else {
    renderEmptyGame();
    renderEmptyRank();
  }

  sendTeamSubscription();
};

// Popup 초기화.
// 저장된 응원 팀을 select에 반영하고 WebSocket 연결을 시작
const initializePopup = () => {
  state.favoriteTeam = normalizeFavoriteTeamValue(state.favoriteTeam);
  localStorage.setItem(FAVORITE_TEAM_STORAGE_KEY, state.favoriteTeam);

  dom.favoriteTeam.value = state.favoriteTeam;

  renderEmptyGame();
  renderEmptyRank();

  dom.favoriteTeam.addEventListener("change", handleFavoriteTeamChange);

  connectWebSocket();
};

initializePopup();