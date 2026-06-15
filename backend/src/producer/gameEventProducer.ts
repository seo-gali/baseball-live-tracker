import type { Producer } from "kafkajs";
import { getKafkaConfig } from "../config/kafkaConfig.js";
import type { GameEvent } from "../events/gameEvent.js";
import { createKafkaClient } from "../kafka/kafkaClient.js";

// Kafka Producer 인스턴스는 매 이벤트마다 새로 만들지 않고 재사용
let producer: Producer | null = null;

// KafkaJS Producer가 connect된 상태인지 추적
let isProducerConnected = false;

// Kafka Producer를 생성하고 연결
export const connectGameEventProducer = async (): Promise<Producer> => {
  if (!producer) {
    const kafka = createKafkaClient();

    producer = kafka.producer({
      // Topic은 ensureGameEventTopic.ts에서 Admin Client로 명시 생성
      allowAutoTopicCreation: false,
    });
  }

  if (!isProducerConnected) {
    await producer.connect();
    isProducerConnected = true;

    console.log("[kafka-producer] connected");
  }

  return producer;
};

// GameEvent를 Kafka Topic으로 발행
export const publishGameEvent = async (event: GameEvent): Promise<void> => {
  const { gameEventsTopic } = getKafkaConfig();
  const activeProducer = await connectGameEventProducer();

  await activeProducer.send({
    topic: gameEventsTopic,
    messages: [
      {
        // 같은 경기의 이벤트를 식별하기 위한 Kafka message key
        key: event.gameId,

        // Kafka message value는 표준 GameEvent JSON 문자열로 저장
        value: JSON.stringify(event),

        // headers는 디버깅과 추적용 메타데이터로 사용
        headers: {
          eventType: event.eventType,
          producedAt: event.timestamp,
        },
      },
    ],
  });

  console.log(`[kafka-producer] ${event.eventType}: ${event.message}`);
};

// 애플리케이션 종료 시 Producer 연결을 정리
// Ctrl + C 종료나 테스트 종료 시 호출
export const disconnectGameEventProducer = async (): Promise<void> => {
  if (!producer || !isProducerConnected) {
    return;
  }

  await producer.disconnect();
  isProducerConnected = false;

  console.log("[kafka-producer] disconnected");
};