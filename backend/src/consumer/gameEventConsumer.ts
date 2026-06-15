import type { Consumer } from "kafkajs";
import { getKafkaConfig } from "../config/kafkaConfig.js";
import type { GameEvent } from "../events/gameEvent.js";
import { parseGameEventMessageValue } from "../events/gameEventValidator.js";
import { createKafkaClient } from "../kafka/kafkaClient.js";

// Consumer가 정상 GameEvent를 소비했을 때 실행할 handler 타입.
export type GameEventHandler = (event: GameEvent) => void | Promise<void>;

export type StartGameEventConsumerOptions = {
  onGameEvent?: GameEventHandler;
};

// Kafka Consumer 인스턴스도 중복 생성하지 않고 하나만 유지
let consumer: Consumer | null = null;

// consumer.run()이 이미 시작되었는지 추적
let isConsumerStarted = false;

// 경기 이벤트 Consumer를 시작
// baseball.game.events Topic을 구독하고, 새 메시지를 GameEvent로 파싱
export const startGameEventConsumer = async (
  options: StartGameEventConsumerOptions = {},
): Promise<void> => {
  if (isConsumerStarted) {
    return;
  }

  const { gameEventsTopic, consumerGroupId } = getKafkaConfig();

  const kafka = createKafkaClient();

  consumer = kafka.consumer({
    groupId: consumerGroupId,
  });

  await consumer.connect();

  console.log(`[kafka-consumer] connected. groupId=${consumerGroupId}`);

  // Phase 5 검증에서는 Consumer를 먼저 실행한 뒤 Producer가 새 이벤트를 발행
  await consumer.subscribe({
    topic: gameEventsTopic,
    fromBeginning: false,
  });

  console.log(`[kafka-consumer] subscribed. topic=${gameEventsTopic}`);

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      // Kafka message.value는 Buffer | null이므로 먼저 GameEvent로 안전하게 파싱한다.
      const event = parseGameEventMessageValue(message.value);

      // Consumer 전체가 죽지 않도록 warning 로그만 남기고 skip
      if (!event) {
        console.warn(
          `[kafka-consumer] invalid message skipped. topic=${topic}, partition=${partition}, offset=${message.offset}`,
        );
        return;
      }

      console.log(
        `[kafka-consumer] ${topic}[${partition}|${message.offset}] ${event.eventType}: ${event.message}`,
      );

      await options.onGameEvent?.(event);
    },
  });

  isConsumerStarted = true;
};

// 애플리케이션 종료 시 Consumer 연결을 정리
export const disconnectGameEventConsumer = async (): Promise<void> => {
  if (!consumer || !isConsumerStarted) {
    return;
  }

  await consumer.disconnect();
  isConsumerStarted = false;

  console.log("[kafka-consumer] disconnected");
};