import type { WebSocketServer } from "ws";
import {
  disconnectGameEventConsumer,
  startGameEventConsumer,
} from "./consumer/gameEventConsumer.js";
import { ensureGameEventTopic } from "./kafka/ensureGameEventTopic.js";
import { createMockGameEventKafkaProducer } from "./producer/mockGameEventKafkaProducer.js";
import {
  broadcastGameEvent,
  getConnectedClientCount,
  startWebSocketServer,
} from "./websocket/webSocketServer.js";

const mockProducer = createMockGameEventKafkaProducer();

let webSocketServer: WebSocketServer | null = null;
let isShuttingDown = false;

// 프로세스 종료 시 Kafka Producer, Consumer, WebSocket Server를 정리
const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(`[backend] shutting down. signal=${signal}`);

  try {
    await mockProducer.stop();
    await disconnectGameEventConsumer();

    if (webSocketServer) {
      await new Promise<void>((resolve, reject) => {
        webSocketServer?.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      console.log("[websocket] server closed");
    }
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

// 실시간 이벤트 파이프라인 시작
const main = async (): Promise<void> => {
  // 1. Chrome Extension Popup 연결을 받을 WebSocket Server 시작
  webSocketServer = startWebSocketServer();

  // 2. Kafka Topic 생성 확인
  await ensureGameEventTopic();

  // 3. Kafka Consumer 시작
  // Consumer가 정상 GameEvent를 소비하면 WebSocket Server로 broadcast
  await startGameEventConsumer({
    onGameEvent: async (event) => {
      console.log(
        `[realtime] consumed ${event.eventType}: ${event.message}. websocketClients=${getConnectedClientCount()}`,
      );

      broadcastGameEvent(event);
    },
  });

  // 4. 실제 Collector 구현 전까지는 Mock Producer를 이벤트 소스로 사용
  await mockProducer.start();

  console.log("[backend] realtime pipeline started");
  console.log("[backend] flow: Mock Producer → Kafka → Consumer → WebSocket → Popup");
};

main().catch(async (error) => {
  console.error("[backend] failed to start realtime pipeline", error);

  await mockProducer.stop();
  await disconnectGameEventConsumer();

  if (webSocketServer) {
    webSocketServer.close();
  }

  process.exit(1);
});