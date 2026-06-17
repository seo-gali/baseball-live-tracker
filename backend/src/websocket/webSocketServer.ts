import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";

import { getServerConfig } from "../config/serverConfig.js";
import type { GameEvent } from "../events/gameEvent.js";

// WebSocket Server가 클라이언트로 보낼 수 있는 공통 메시지 구조
export type WebSocketServerMessage = {
  type: string;
  payload?: unknown;
};

// 서버 연결 상태를 클라이언트에 알려주기 위한 메시지 구조
type ServerStatusMessage = {
  type: "SERVER_STATUS";
  payload: {
    clientId: string;
    message: string;
    timestamp: string;
  };
};

// Kafka Consumer가 전달한 실제 경기 이벤트 메시지 구조
type GameEventMessage = {
  type: "GAME_EVENT";
  payload: GameEvent;
};

// 클라이언트가 서버로 보낼 수 있는 메시지의 최소 구조
type ClientMessage = {
  type: string;
  payload?: unknown;
};

// 현재 WebSocket Server에 연결된 클라이언트 목록
// key는 서버에서 발급한 clientId, value는 실제 WebSocket 연결 객체
const clients = new Map<string, WebSocket>();

// 가장 최근 KBO 수집 snapshot을 보관한다.
// Popup이 수집 이후에 접속해도 즉시 현재 경기 정보를 받을 수 있게 하기 위함
let latestSnapshotMessage: WebSocketServerMessage | null = null;

// snapshot으로 취급할 메시지 타입 목록
const SNAPSHOT_MESSAGE_TYPES = new Set([
  "KBO_SNAPSHOT",
  "SCOREBOARD_SNAPSHOT",
  "KBO_COLLECTED_DATA",
]);

// WebSocket 연결이 아직 열려 있는지 확인
const isOpen = (client: WebSocket): boolean => {
  return client.readyState === WebSocket.OPEN;
};

// 서버 메시지를 JSON 문자열로 변환해서 클라이언트에 전송
const sendJson = (
  client: WebSocket,
  message: WebSocketServerMessage,
): boolean => {
  if (!isOpen(client)) {
    return false;
  }

  client.send(JSON.stringify(message));
  return true;
};

// 최신 snapshot 메시지를 메모리에 저장
const cacheLatestSnapshotMessage = (message: WebSocketServerMessage): void => {
  if (!SNAPSHOT_MESSAGE_TYPES.has(message.type)) {
    return;
  }

  latestSnapshotMessage = message;
};

// 새로 연결된 클라이언트 또는 팀 구독을 다시 보낸 클라이언트에 최신 snapshot 재전송
const replayLatestSnapshot = (clientId: string, client: WebSocket): void => {
  if (!latestSnapshotMessage) {
    return;
  }

  const sent = sendJson(client, latestSnapshotMessage);

  if (sent) {
    console.log(
      `[websocket] replay ${latestSnapshotMessage.type}. clientId=${clientId}`,
    );
  }
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
    if (sendJson(client, message)) {
      sentCount += 1;
    }
  }

  console.log(
    `[websocket] broadcast ${event.eventType}: ${event.message}. clients=${sentCount}`,
  );
};

// KBO snapshot 등 일반 WebSocket 메시지를 모든 클라이언트에 broadcast
// KBO_SNAPSHOT은 최신 상태로 저장해두었다가 나중에 연결된 Popup에도 재전송한다.
const broadcastWebSocketMessage = (message: WebSocketServerMessage): void => {
  cacheLatestSnapshotMessage(message);

  let sentCount = 0;

  for (const client of clients.values()) {
    if (sendJson(client, message)) {
      sentCount += 1;
    }
  }

  console.log(`[websocket] broadcast ${message.type}. clients=${sentCount}`);
};

// 클라이언트에서 받은 raw message를 JSON 객체로 파싱
// 잘못된 JSON이거나 type 필드가 없으면 null을 반환
const parseClientMessage = (
  rawMessage: WebSocket.RawData,
): ClientMessage | null => {
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
    } satisfies ServerStatusMessage);

    // 이미 수집된 KBO snapshot이 있으면 새로 연결된 Popup에 즉시 전달
    replayLatestSnapshot(clientId, client);

    // 클라이언트에서 보낸 메시지 수신
    client.on("message", (rawMessage) => {
      const message = parseClientMessage(rawMessage);

      if (!message) {
        console.warn(`[websocket] invalid client message: ${clientId}`);
        return;
      }

      console.log(`[websocket] client message from ${clientId}:`, message);

      // Popup에서 팀 변경 후 SUBSCRIBE_TEAM을 다시 보내면
      // 최신 snapshot을 즉시 재전송해서 화면을 바로 갱신한다.
      if (message.type === "SUBSCRIBE_TEAM") {
        replayLatestSnapshot(clientId, client);
      }
    });

    // 클라이언트 연결이 정상 종료되면 clients 목록에서 제거
    client.on("close", () => {
      clients.delete(clientId);
      console.log(`[websocket] client disconnected: ${clientId}`);
    });

    // 클라이언트 연결 중 오류가 발생하면 clients 목록에서 제거
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

export {
  broadcastGameEvent,
  broadcastWebSocketMessage,
  getConnectedClientCount,
};