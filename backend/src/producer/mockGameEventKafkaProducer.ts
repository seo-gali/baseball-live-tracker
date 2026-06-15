import {
  createMockGameEventGenerator,
  MOCK_GAME_EVENT_INTERVAL_MS,
} from "../events/mockGameEventGenerator.js";
import {
  connectGameEventProducer,
  disconnectGameEventProducer,
  publishGameEvent,
} from "./gameEventProducer.js";

// Mock 이벤트 Kafka Producer의 외부 공개 인터페이스.
export type MockGameEventKafkaProducer = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

// Mock GameEvent Generator를 재사용해서 Kafka로 이벤트를 발행
export const createMockGameEventKafkaProducer =
  (): MockGameEventKafkaProducer => {
    const generator = createMockGameEventGenerator();

    // setInterval timer id.
    // start 중복 호출과 stop 시 정리를 위해 보관
    let timer: NodeJS.Timeout | null = null;

    // 이전 publish가 끝나기 전에 다음 interval이 들어오는 상황을 막기 위한 플래그
    let isPublishing = false;

    // Mock Generator에서 다음 GameEvent를 꺼내 Kafka Topic으로 발행
    const publishNext = async (): Promise<void> => {
      if (isPublishing) {
        return;
      }

      isPublishing = true;

      try {
        const event = generator.next();

        await publishGameEvent(event);
      } finally {
        isPublishing = false;
      }
    };

    return {
      // Producer를 연결하고 즉시 첫 이벤트를 한 번 발행한 뒤,
      // 이후 MOCK_GAME_EVENT_INTERVAL_MS 간격으로 다음 이벤트 발행
      start: async () => {
        if (timer) {
          return;
        }

        await connectGameEventProducer();

        // 실행 직후 GAME_START가 바로 발행되도록 첫 이벤트는 즉시 publish
        await publishNext();

        timer = setInterval(() => {
          publishNext().catch((error) => {
            console.error("[mock-kafka-producer] publish failed", error);
          });
        }, MOCK_GAME_EVENT_INTERVAL_MS);

        console.log(
          `[mock-kafka-producer] started. interval=${MOCK_GAME_EVENT_INTERVAL_MS}ms`,
        );
      },

      // interval을 중지하고 Mock 시나리오 index와 Kafka Producer 연결을 정리
      stop: async () => {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }

        generator.reset();

        await disconnectGameEventProducer();

        console.log("[mock-kafka-producer] stopped");
      },
    };
  };