import {
  disconnectGameEventConsumer,
  startGameEventConsumer,
} from "./consumer/gameEventConsumer.js";
import { ensureGameEventTopic } from "./kafka/ensureGameEventTopic.js";
import { createMockGameEventKafkaProducer } from "./producer/mockGameEventKafkaProducer.js";

// WebSocket Server와는 분리해서 Kafka 흐름만 확인
const mockProducer = createMockGameEventKafkaProducer();

let isShuttingDown = false;

// Ctrl + C 또는 프로세스 종료 신호를 받았을 때 Producer / Consumer 연결을 정리
const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(`[kafka-demo] shutting down. signal=${signal}`);

  try {
    await mockProducer.stop();
    await disconnectGameEventConsumer();
  } finally {
    process.exit(0);
  }
};

// Windows PowerShell에서 Ctrl + C를 누르면 들어오는 신호
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

// Docker나 OS에서 종료 요청을 보낼 때 들어오는 신호
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

// Kafka pipeline 검증 순서:
// 1. Topic 생성 확인
// 2. Consumer 시작
// 3. Mock Producer 시작
// 4. Producer → Kafka → Consumer 로그 확인
const main = async (): Promise<void> => {
  await ensureGameEventTopic();

  await startGameEventConsumer();

  await mockProducer.start();

  console.log("[kafka-demo] Producer → Kafka → Consumer pipeline started");
};

// 시작 중 에러가 발생하면 열린 연결을 정리하고 프로세스를 실패 종료
main().catch(async (error) => {
  console.error("[kafka-demo] failed to start", error);

  await mockProducer.stop();
  await disconnectGameEventConsumer();

  process.exit(1);
});