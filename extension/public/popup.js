const WS_URL = "ws://localhost:4000";
const MAX_EVENT_LOGS = 8;

// 서버에서 받은 eventType을 Popup 화면에 표시할 한글 라벨로 변환하기 위한 매핑
const EVENT_TYPE_LABELS = {
  GAME_START: "경기 시작",
  GAME_END: "경기 종료",
  SCORE: "득점",
  HOME_RUN: "홈런",
  OUT_COUNT_CHANGE: "아웃카운트",
  PITCHER_CHANGE: "투수 교체",
  BATTER_CHANGE: "타자 교체",
  INNING_CHANGE: "이닝 변경",
  ERROR: "오류",
};

// 정의되지 않은 eventType이 들어오면 원본 값을 그대로 표시
const formatEventTypeLabel = (eventType) => {
  return EVENT_TYPE_LABELS[eventType] ?? eventType;
};

// Popup에서 사용자가 선택한 응원 팀 select box
const favoriteTeamSelect = document.querySelector("#favorite-team");

// 현재 선택된 팀을 화면에 표시하는 영역
const selectedTeamText = document.querySelector("#selected-team");

// 점수판 영역
const awayTeamText = document.querySelector("#away-team");
const awayScoreText = document.querySelector("#away-score");
const homeTeamText = document.querySelector("#home-team");
const homeScoreText = document.querySelector("#home-score");

// 경기 상태 영역
const inningStatusText = document.querySelector("#inning-status");
const outCountText = document.querySelector("#out-count");

// 최근 이벤트 로그 영역
const eventList = document.querySelector("#event-list");

// WebSocket 연결 상태 표시 영역
const statusDot = document.querySelector("#status-dot");
const connectionText = document.querySelector("#connection-text");

// 현재 Popup에서 사용하는 WebSocket 연결 객체
let socket = null;

// 서버 연결이 끊겼을 때 재연결을 예약하는 timer id
let reconnectTimerId = null;

// Popup이 닫히면서 의도적으로 연결을 종료하는지 구분하기 위한 flag
let isManualClose = false;

// 연결 상태 텍스트와 상태 점 색상을 함께 갱신
const setConnectionStatus = (status, message) => {
  statusDot.className = `status-dot ${status}`;
  connectionText.textContent = message;
};

// 서버 이벤트의 이닝 초/말 값을 화면 표시용 한글로 변환
const formatInningHalf = (inningHalf) => {
  if (inningHalf === "TOP") {
    return "초";
  }

  if (inningHalf === "BOTTOM") {
    return "말";
  }

  return "";
};

// 초기 HTML에 들어 있는 기본 대기 문구를 제거
const clearWaitingPlaceholder = () => {
  const firstItem = eventList.querySelector("li");

  if (
    eventList.children.length === 1 &&
    firstItem &&
    firstItem.textContent === "WebSocket 연결 대기"
  ) {
    eventList.innerHTML = "";
  }
};

// 최근 이벤트 로그를 상단에 추가
// 최대 MAX_EVENT_LOGS 개수만 유지
const appendEventLog = (message) => {
  clearWaitingPlaceholder();

  const item = document.createElement("li");
  item.textContent = message;

  eventList.prepend(item);

  while (eventList.children.length > MAX_EVENT_LOGS) {
    eventList.removeChild(eventList.lastElementChild);
  }
};

// 서버에서 받은 GAME_EVENT payload를 Popup 화면에 반영
const renderGameEvent = (event) => {
  awayTeamText.textContent = event.awayTeam;
  awayScoreText.textContent = String(event.awayScore);

  homeTeamText.textContent = event.homeTeam;
  homeScoreText.textContent = String(event.homeScore);

  inningStatusText.textContent = `${event.inning}회${formatInningHalf(event.inningHalf)}`;
  outCountText.textContent = `${event.outCount} Out`;

  // 최근 이벤트 로그에는 eventType 라벨과 서버 메시지를 함께 표시
  appendEventLog(`[${formatEventTypeLabel(event.eventType)}] ${event.message}`);
};

// 현재 선택된 응원 팀을 서버로 전송
const sendSelectedTeam = () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(
    JSON.stringify({
      type: "SUBSCRIBE_TEAM",
      payload: {
        team: favoriteTeamSelect.value,
      },
    }),
  );
};

// 예약된 재연결 timer가 있으면 제거
const clearReconnectTimer = () => {
  if (reconnectTimerId) {
    clearTimeout(reconnectTimerId);
    reconnectTimerId = null;
  }
};

// WebSocket 연결이 끊겼을 때 2초 뒤 재연결 시도
const scheduleReconnect = () => {
  clearReconnectTimer();

  reconnectTimerId = setTimeout(() => {
    connectWebSocket();
  }, 2000);
};

// WebSocket Server에 연결
const connectWebSocket = () => {
  setConnectionStatus("connecting", "WebSocket 연결 중");

  socket = new WebSocket(WS_URL);

  // 서버와 연결되면 연결 상태를 갱신하고 현재 선택 팀을 서버에 전송
  socket.addEventListener("open", () => {
    setConnectionStatus("connected", "WebSocket 연결 완료");
    sendSelectedTeam();
  });

  // 서버에서 보낸 메시지를 수신
  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data);

      if (message.type === "SERVER_STATUS") {
        appendEventLog(message.payload.message);
        return;
      }

      if (message.type === "GAME_EVENT") {
        renderGameEvent(message.payload);
        return;
      }

      appendEventLog("알 수 없는 서버 메시지 수신");
    } catch {
      appendEventLog("서버 메시지 파싱 실패");
    }
  });

  // 연결이 종료되면 상태를 갱신
  socket.addEventListener("close", () => {
    setConnectionStatus("disconnected", "WebSocket 연결 종료");

    if (!isManualClose) {
      scheduleReconnect();
    }
  });

  // 연결 중 오류가 발생하면 화면에 오류 상태를 표시
  socket.addEventListener("error", () => {
    setConnectionStatus("error", "WebSocket 연결 오류");
  });
};

// 응원 팀 select box가 변경되면 화면 표시를 바꾸고 서버에도 선택 팀을 전달
favoriteTeamSelect.addEventListener("change", (event) => {
  selectedTeamText.textContent = event.target.value;
  sendSelectedTeam();
});

// Popup이 닫힐 때 timer와 WebSocket 연결을 정리
window.addEventListener("beforeunload", () => {
  isManualClose = true;
  clearReconnectTimer();

  if (socket) {
    socket.close(1000, "popup closed");
  }
});

// Popup이 열리면 즉시 WebSocket 연결 시작
connectWebSocket();