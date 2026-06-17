// Kafka 연결과 Topic 이름을 한 곳에서 관리하기 위한 설정 타입
export type KafkaConfig = {
  // Kafka 로그나 broker client 식별에 사용
  clientId: string;

  // Kafka broker 주소 목록
  brokers: string[];

  // 경기 이벤트를 발행하고 소비할 Kafka Topic 이름
  gameEventsTopic: string;

  // 경기 이벤트 Consumer Group ID
  consumerGroupId: string;
};

// 필수 환경변수 값을 읽고 비어 있는지 확인
const getRequiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
};

// KAFKA_BROKERS는 콤마로 구분된 broker 목록
// 예: localhost:9092 또는 localhost:9092,localhost:9093
const parseKafkaBrokers = (value: string): string[] => {
  const brokers = value
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean);

  if (brokers.length === 0) {
    throw new Error("KAFKA_BROKERS must include at least one broker");
  }

  return brokers;
};

// Kafka 관련 설정을 환경변수에서만 읽어온다.
export const getKafkaConfig = (): KafkaConfig => {
  return {
    clientId: getRequiredEnv("KAFKA_CLIENT_ID"),
    brokers: parseKafkaBrokers(getRequiredEnv("KAFKA_BROKERS")),
    gameEventsTopic: getRequiredEnv("KAFKA_GAME_EVENTS_TOPIC"),
    consumerGroupId: getRequiredEnv("KAFKA_CONSUMER_GROUP_ID"),
  };
};