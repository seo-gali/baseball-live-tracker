import { Kafka, logLevel } from "kafkajs";
import { getKafkaConfig } from "../config/kafkaConfig.js";

// KafkaJS Client를 생성
// Producer, Consumer, Admin Client는 모두 이 Kafka Client에서 파생
export const createKafkaClient = (): Kafka => {
  const { clientId, brokers } = getKafkaConfig();

  return new Kafka({
    clientId,
    brokers,
    logLevel: logLevel.INFO,
  });
};