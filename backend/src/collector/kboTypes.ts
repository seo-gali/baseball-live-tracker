// KBO 스코어보드에서 파싱한 경기 상태 값
export type KboGameStatus =
  | "SCHEDULED"
  | "LIVE"
  | "FINAL"
  | "CANCELED"
  | "UNKNOWN";

// 진행 중 경기의 주자 점유 상태
export type BaseState = {
  // 1루 주자 여부
  first: boolean;

  // 2루 주자 여부
  second: boolean;

  // 3루 주자 여부
  third: boolean;
};

// 한 팀의 이닝별 점수와 R / H / E / B 값을 표현하는 구조
export type KboTeamLineScore = {
  // 팀명
  team: string;

  // 1회부터 최대 15회까지의 이닝별 점수
  // 아직 진행되지 않은 이닝이나 "-" 값은 null
  inningScores: Array<number | null>;

  // R: 총 득점
  runs: number;

  // H: 안타 수
  // 값이 없거나 "-"이면 null
  hits: number | null;

  // E: 실책 수
  // 값이 없거나 "-"이면 null
  errors: number | null;

  // B: 볼넷 수
  // 값이 없거나 "-"이면 null
  basesOnBalls: number | null;
};

// KBO 스코어보드에서 파싱한 경기 단위 데이터
export type KboScoreboardGame = {
  // 내부에서 사용할 경기 식별자
  gameId: string;

  // 경기 날짜
  gameDate: string;

  // 경기 시작 시간
  gameTime: string;

  // 경기장
  stadium: string;

  // 원정 팀
  awayTeam: string;

  // 홈 팀
  homeTeam: string;

  // 원정 팀 현재 점수
  awayScore: number;

  // 홈 팀 현재 점수
  homeScore: number;

  // 원정 팀 이닝별 점수 / R / H / E / B
  awayLineScore: KboTeamLineScore;

  // 홈 팀 이닝별 점수 / R / H / E / B
  homeLineScore: KboTeamLineScore;

  // 경기 상태
  gameStatus: KboGameStatus;

  // 진행 중 경기의 현재 이닝
  // 경기전, 경기 종료 또는 파싱할 수 없으면 null
  inning: number | null;

  // 초: TOP, 말: BOTTOM
  // 경기전, 경기 종료 또는 파싱할 수 없으면 null
  inningHalf: "TOP" | "BOTTOM" | null;

  // 현재 볼카운트
  ballCount: number | null;

  // 현재 스트라이크카운트
  strikeCount: number | null;

  // 현재 아웃카운트
  outCount: number | null;

  // 현재 주자 점유 상태
  // 진행 중 경기에서 base 영역을 확인할 수 없으면 null
  baseState: BaseState | null;

  // 수집 시각
  collectedAt: string;
};

// KBO 팀 순위 페이지에서 파싱한 팀 순위 데이터
export type KboTeamRank = {
  // 순위
  rank: number;

  // 팀명
  teamName: string;

  // 경기 수
  games: number;

  // 승
  wins: number;

  // 패
  losses: number;

  // 무
  draws: number;

  // 승률
  winningRate: number;

  // 게임차
  gamesBehind: string;

  // 최근 10경기 성적
  recentTenGames: string;

  // 연속 기록
  streak: string;

  // 홈 성적
  homeRecord: string;

  // 방문 성적
  awayRecord: string;
};

// KBO Collector가 한 번의 수집에서 반환하는 전체 데이터
export type KboCollectedData = {
  // 전체 수집 시각
  collectedAt: string;

  // 스코어보드 경기 목록
  scoreboardGames: KboScoreboardGame[];

  // 팀 순위 목록
  teamRanks: KboTeamRank[];
};