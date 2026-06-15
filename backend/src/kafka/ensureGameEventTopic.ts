import { getKafkaConfig } from "../config/kafkaConfig.js";
import { createKafkaClient } from "./kafkaClient.js";

// 경기 이벤트 Topic이 없으면 생성
export const ensureGameEventTopic = async (): Promise<void> => {
  const { gameEventsTopic } = getKafkaConfig();

  const kafka = createKafkaClient();

  // Topic 생성, 목록 조회 같은 관리 작업은 Admin Client가 담당
  const admin = kafka.admin();

  await admin.connect();

  try {
    // 이미 생성된 Topic인지 먼저 확인
    const topics = await admin.listTopics();

    if (topics.includes(gameEventsTopic)) {
      console.log(`[kafka-admin] topic already exists: ${gameEventsTopic}`);
      return;
    }

    // 로컬 단일 브로커 개발 환경이므로 partition 1개, replication factor 1개로 생성
    const created = await admin.createTopics({
      waitForLeaders: true,
      topics: [
        {
          topic: gameEventsTopic,
          numPartitions: 1,
          replicationFactor: 1,
        },
      ],
    });

    if (created) {
      console.log(`[kafka-admin] topic created: ${gameEventsTopic}`);
      return;
    }

    // KafkaJS createTopics는 이미 존재하거나 생성되지 않은 경우 false 반환 가능
    console.log(`[kafka-admin] topic exists or was not created: ${gameEventsTopic}`);
  } finally {
    // Admin Client는 Topic 확인/생성 후 계속 유지할 필요가 없으므로 연결 정리
    await admin.disconnect();
  }
};