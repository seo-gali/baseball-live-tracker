import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { getServerConfig } from "../config/serverConfig.js";
import type { GameEvent } from "../events/gameEvent.js";
import { createMockGameEvent } from "./mockGameEvent.js";

// 서버 연결 상태를 클라이언트에 알려주기 위한 메시지 구조
// Popup에서는 이 메시지를 받아 "WebSocket 연결 완료" 같은 상태 로그로 표시
type ServerStatusMessage = {
  type: "SERVER_STATUS";
  payload: {
    clientId: string;
    message: string;
    timestamp: string;
  };
};

// 실제 경기 이벤트를 클라이언트에 전달하기 위한 메시지 구조
// payload에는 표준 GameEvent 모델 사용
type GameEventMessage = {
  type: "GAME_EVENT";
  payload: GameEvent;
};

// 서버가 클라이언트로 보낼 수 있는 메시지 타입
type ServerMessage = ServerStatusMessage | GameEventMessage;

// 클라이언트가 서버로 보낼 수 있는 메시지의 최소 구조
type ClientMessage = {
  type: string;
  payload?: unknown;
};

// 현재 WebSocket Server에 연결된 클라이언트 목록
// key는 서버에서 발급한 clientId, value는 WebSocket 연결 객체
const clients = new Map<string, WebSocket>();

// WebSocket 연결이 아직 열려 있는지 확인
// 닫힌 연결에 send를 호출하면 에러가 날 수 있으므로 전송 전에 체크
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

// 연결된 모든 클라이언트에게 경기 이벤트를 전송
const broadcastGameEvent = (event: GameEvent): void => {
  const message: GameEventMessage = {
    type: "GAME_EVENT",
    payload: event,
  };

  for (const client of clients.values()) {
    sendJson(client, message);
  }
};

// 클라이언트에서 받은 raw message를 JSON 객체로 파싱
// 잘못된 JSON이 들어오거나 type 필드가 없으면 null 반환
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

// WebSocket Server 시작
export const startWebSocketServer = (): WebSocketServer => {
  const { websocketPort } = getServerConfig();

  const server = new WebSocketServer({
    port: websocketPort,
  });

  server.on("listening", () => {
    console.log(`[websocket] server listening on ws://localhost:${websocketPort}`);
  });

  // Chrome Extension Popup이 WebSocket에 연결되면 실행된다.
  server.on("connection", (client) => {
    const clientId = randomUUID();

    clients.set(clientId, client);

    console.log(`[websocket] client connected: ${clientId}`);

    // 연결 직후 클라이언트에 연결 완료 상태를 먼저 전송
    sendJson(client, {
      type: "SERVER_STATUS",
      payload: {
        clientId,
        message: "WebSocket 연결 완료",
        timestamp: new Date().toISOString(),
      },
    });

    // 여러 이벤트를 일정 간격으로 생성하는 기능
    sendJson(client, {
      type: "GAME_EVENT",
      payload: createMockGameEvent(),
    });

    // 클라이언트가 보낸 메시지를 수신
    client.on("message", (rawMessage) => {
      const message = parseClientMessage(rawMessage);

      if (!message) {
        console.warn(`[websocket] invalid client message: ${clientId}`);
        return;
      }

      console.log(`[websocket] client message from ${clientId}:`, message);
    });

    // 클라이언트 연결이 정상 종료되면 목록에서 제거
    client.on("close", () => {
      clients.delete(clientId);
      console.log(`[websocket] client disconnected: ${clientId}`);
    });

    // 클라이언트 연결 중 에러가 발생해도 목록에서 제거
    client.on("error", (error) => {
      clients.delete(clientId);
      console.error(`[websocket] client error: ${clientId}`, error);
    });
  });

  server.on("error", (error) => {
    console.error("[websocket] server error", error);
  });

  return server;
};

export { broadcastGameEvent };