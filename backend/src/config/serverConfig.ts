export type ServerConfig = {
  websocketPort: number;
};

// 환경변수 WEBSOCKET_PORT가 있으면 해당 값을 우선 사용
const DEFAULT_WEBSOCKET_PORT = 4000;

export const getServerConfig = (): ServerConfig => {
  const rawPort = process.env.WEBSOCKET_PORT;
  const websocketPort = rawPort ? Number(rawPort) : DEFAULT_WEBSOCKET_PORT;

  // 포트 값이 숫자가 아니거나 0 이하이면 서버 실행 불가
  if (!Number.isInteger(websocketPort) || websocketPort <= 0) {
    throw new Error(`Invalid WEBSOCKET_PORT value: ${rawPort}`);
  }

  return {
    websocketPort,
  };
};