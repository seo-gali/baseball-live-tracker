import type { WebSocketServer } from "ws";

import { collectAndPublishKboEvents } from "./collector/kboCollector.js";
import { getKboCollectorConfig } from "./config/kboConfig.js";
import {
  disconnectGameEventConsumer,
  startGameEventConsumer,
} from "./consumer/gameEventConsumer.js";
import { ensureGameEventTopic } from "./kafka/ensureGameEventTopic.js";
import {
  broadcastGameEvent,
  broadcastWebSocketMessage,
  getConnectedClientCount,
  startWebSocketServer,
} from "./websocket/webSocketServer.js";

let webSocketServer: WebSocketServer | null = null;
let collectorIntervalId: NodeJS.Timeout | null = null;
let isCollecting = false;
let isShuttingDown = false;

// KBO Collector가 이전 수집을 끝내기 전에 다음 polling이 겹치지 않도록 막는다.
// 수집 성공 시 현재 스코어보드 snapshot을 WebSocket으로 바로 전달한다.
const runKboCollectorOnce = async (): Promise<void> => {
  if (isCollecting) {
    console.warn(
      "[kbo-collector] skipped because previous collection is still running",
    );
    return;
  }

  isCollecting = true;

  try {
    const collectedData = await collectAndPublishKboEvents();

    if (!collectedData) {
      return;
    }

    broadcastWebSocketMessage({
      type: "KBO_SNAPSHOT",
      payload: collectedData,
    });
  } catch (error) {
    console.error("[kbo-collector] collection failed", error);
  } finally {
    isCollecting = false;
  }
};

// 프로세스 종료 시 Collector interval, Kafka Consumer, WebSocket Server를 정리
const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(`[backend] shutting down. signal=${signal}`);

  try {
    if (collectorIntervalId) {
      clearInterval(collectorIntervalId);
      collectorIntervalId = null;

      console.log("[kbo-collector] polling stopped");
    }

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

      webSocketServer = null;

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
  const { collectorIntervalMs } = getKboCollectorConfig();

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

  // 4. KBO Collector를 이벤트 소스로 사용
  // 첫 수집 결과도 KBO_SNAPSHOT으로 WebSocket에 전달한다.
  await runKboCollectorOnce();

  collectorIntervalId = setInterval(() => {
    void runKboCollectorOnce();
  }, collectorIntervalMs);

  console.log(
    `[kbo-collector] polling started. interval=${collectorIntervalMs}ms`,
  );

  console.log("[backend] realtime pipeline started");
  console.log("[backend] flow: KBO Collector → Kafka → Consumer → WebSocket → Popup");
};

main().catch(async (error) => {
  console.error("[backend] failed to start realtime pipeline", error);

  if (collectorIntervalId) {
    clearInterval(collectorIntervalId);
    collectorIntervalId = null;
  }

  await disconnectGameEventConsumer();

  if (webSocketServer) {
    webSocketServer.close();
  }

  process.exit(1);
});