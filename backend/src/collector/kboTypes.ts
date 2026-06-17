// KBO 스코어보드에서 파싱한 경기 상태 값
export type KboGameStatus =
  | "SCHEDULED"
  | "LIVE"
  | "FINAL"
  | "CANCELED"
  | "UNKNOWN";

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

  // 승리 투수 텍스트
  // 스코어보드에 없으면 null
  winningPitcherText: string | null;

  // 패전 투수 텍스트
  // 스코어보드에 없으면 null
  losingPitcherText: string | null;

  // 세이브 투수 텍스트
  // 세이브가 없거나 스코어보드에 없으면 null
  savePitcherText: string | null;

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