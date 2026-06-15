import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { getServerConfig } from "../config/serverConfig.js";
import type { GameEvent } from "../events/gameEvent.js";

// 서버 연결 상태를 클라이언트에 알려주기 위한 메시지 구조.
// Popup에서는 이 메시지를 받아 연결 완료 로그와 상태 UI를 갱신
type ServerStatusMessage = {
  type: "SERVER_STATUS";
  payload: {
    clientId: string;
    message: string;
    timestamp: string;
  };
};

// 실제 경기 이벤트를 클라이언트에 전달하기 위한 메시지 구조.
// payload는 backend/src/events/gameEvent.ts에 정의된 표준 GameEvent 모델을 사용
type GameEventMessage = {
  type: "GAME_EVENT";
  payload: GameEvent;
};

// WebSocket Server가 클라이언트로 보낼 수 있는 메시지 타입.
type ServerMessage = ServerStatusMessage | GameEventMessage;

// 클라이언트가 서버로 보낼 수 있는 메시지의 최소 구조.
// Phase 6에서는 SUBSCRIBE_TEAM 메시지를 로그 확인용으로만 받는다.
type ClientMessage = {
  type: string;
  payload?: unknown;
};

// 현재 WebSocket Server에 연결된 클라이언트 목록
// key는 서버에서 발급한 clientId, value는 실제 WebSocket 연결 객체
const clients = new Map<string, WebSocket>();

// WebSocket 연결이 아직 열려 있는지 확인
// 닫힌 연결에 send를 호출하면 오류가 날 수 있으므로 전송 전 체크
const isOpen = (client: WebSocket): boolean => {
  return client.readyState === WebSocket.OPEN;
};

// 서버 메시지를 JSON 문자열로 변환해서 클라이언트에 전송
const sendJson = (client: WebSocket, message: ServerMessage): void => {
  if (!isOpen(client)) {
    return;
  }

  client.send(JSON.stringify(message));
};

// Kafka Consumer가 전달한 GameEvent를 현재 연결된 모든 클라이언트에 broadcast
// WebSocket Server는 자체 Mock 이벤트를 만들지 않고, 이 함수로 받은 이벤트만 전송
const broadcastGameEvent = (event: GameEvent): void => {
  const message: GameEventMessage = {
    type: "GAME_EVENT",
    payload: event,
  };

  let sentCount = 0;

  for (const client of clients.values()) {
    if (!isOpen(client)) {
      continue;
    }

    sendJson(client, message);
    sentCount += 1;
  }

  console.log(
    `[websocket] broadcast ${event.eventType}: ${event.message}. clients=${sentCount}`,
  );
};

// 클라이언트에서 받은 raw message를 JSON 객체로 파싱
// 잘못된 JSON이거나 type 필드가 없으면 null을 반환
const parseClientMessage = (rawMessage: WebSocket.RawData): ClientMessage | null => {
  try {
    const parsed = JSON.parse(rawMessage.toString());

    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return null;
    }

    return parsed as ClientMessage;
  } catch {
    return null;
  }
};

// 현재 연결된 client 수를 외부에서 확인 가능
const getConnectedClientCount = (): number => {
  let count = 0;

  for (const client of clients.values()) {
    if (isOpen(client)) {
      count += 1;
    }
  }

  return count;
};

// WebSocket Server 시작
export const startWebSocketServer = (): WebSocketServer => {
  const { websocketPort } = getServerConfig();

  const server = new WebSocketServer({
    port: websocketPort,
  });
  
	// 서버가 정상적으로 listen 상태에 들어가면 실행 로그를 출력
  server.on("listening", () => {
    console.log(`[websocket] server listening on ws://localhost:${websocketPort}`);
  });

  // Chrome Extension Popup이 WebSocket Server에 연결되면 실행
  server.on("connection", (client) => {
    // 각 WebSocket 연결을 식별하기 위해 서버에서 UUID를 발급
    const clientId = randomUUID();

    clients.set(clientId, client);

    console.log(`[websocket] client connected: ${clientId}`);

    // 연결 직후 클라이언트에 연결 완료 상태 메시지 전송
    sendJson(client, {
      type: "SERVER_STATUS",
      payload: {
        clientId,
        message: "WebSocket 연결 완료",
        timestamp: new Date().toISOString(),
      },
    });

    // 클라이언트에서 보낸 메시지 수신
    client.on("message", (rawMessage) => {
      const message = parseClientMessage(rawMessage);

      if (!message) {
        console.warn(`[websocket] invalid client message: ${clientId}`);
        return;
      }

      console.log(`[websocket] client message from ${clientId}:`, message);
    });

    // 클라이언트 연결이 정상 종료되면 clients 목록에서 제거
    // 모든 클라이언트가 종료된 경우 Mock 이벤트 loop도 정리
    client.on("close", () => {
      clients.delete(clientId);
      console.log(`[websocket] client disconnected: ${clientId}`);
    });

    // 클라이언트 연결 중 오류가 발생해도 clients 목록에서 제거
    // 오류로 인해 모든 연결이 사라진 경우 Mock 이벤트 loop 정리
    client.on("error", (error) => {
      clients.delete(clientId);
      console.error(`[websocket] client error: ${clientId}`, error);
    });
  });

  // WebSocket Server 자체에서 발생한 오류 기록
  server.on("error", (error) => {
    console.error("[websocket] server error", error);
  });

  return server;
};

export { broadcastGameEvent, getConnectedClientCount };