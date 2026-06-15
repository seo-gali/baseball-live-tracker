// Kafka 연결과 Topic 이름을 한 곳에서 관리하기 위한 설정 타입
export type KafkaConfig = {
  // Kafka 로그나 broker client 식별에 사용
  clientId: string;

  // Kafka broker 주소 목록.
  brokers: string[];

  // 경기 이벤트를 발행하고 소비할 Kafka Topic 이름
  gameEventsTopic: string;

  // 경기 이벤트 Consumer Group ID.
  consumerGroupId: string;
};

// 로컬 개발 환경 기준 기본 clientId
const DEFAULT_KAFKA_CLIENT_ID = "baseball-live-tracker-backend";

// Docker Compose로 실행한 Kafka가 host PC의 localhost:9092에 노출되어 있다는 전제
const DEFAULT_KAFKA_BROKERS = "localhost:9092";

// Phase 5에서 사용할 경기 이벤트 Topic 이름
const DEFAULT_GAME_EVENTS_TOPIC = "baseball.game.events";

// Phase 5 Consumer 기본 groupId
const DEFAULT_CONSUMER_GROUP_ID = "baseball-live-tracker-game-event-consumer";

const parseKafkaBrokers = (value: string): string[] => {
  const brokers = value
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean);

  // 빈 문자열이나 콤마만 들어온 경우 Kafka 연결이 불가능하므로 즉시 실패 처리
  if (brokers.length === 0) {
    throw new Error("KAFKA_BROKERS must include at least one broker");
  }

  return brokers;
};

// Kafka 관련 설정을 환경변수 또는 기본값에서 읽어온다.
export const getKafkaConfig = (): KafkaConfig => {
  const clientId = process.env.KAFKA_CLIENT_ID ?? DEFAULT_KAFKA_CLIENT_ID;
  const rawBrokers = process.env.KAFKA_BROKERS ?? DEFAULT_KAFKA_BROKERS;
  const gameEventsTopic =
    process.env.KAFKA_GAME_EVENTS_TOPIC ?? DEFAULT_GAME_EVENTS_TOPIC;
  const consumerGroupId =
    process.env.KAFKA_CONSUMER_GROUP_ID ?? DEFAULT_CONSUMER_GROUP_ID;

  return {
    clientId,
    brokers: parseKafkaBrokers(rawBrokers),
    gameEventsTopic,
    consumerGroupId,
  };
};