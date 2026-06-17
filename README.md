# Baseball Live Tracker

> KBO 공식 스코어보드와 팀 순위 데이터를 기반으로 Kafka와 WebSocket을 통해 경기 상태를 Chrome Extension Popup에 전달하는 학습용 프로젝트

## 개요

Baseball Live Tracker는 KBO 공식 사이트의 스코어보드와 팀 순위 데이터를 수집하고, Kafka 기반 이벤트 파이프라인을 통해 처리한 뒤 WebSocket으로 Chrome Extension Popup에 전달하는 학습용 프로젝트다.

이 프로젝트는 전체 야구 기록 서비스나 문자중계 서비스가 아니다.

목표는 KBO 공식 사이트의 공개 HTML에서 확인 가능한 경기 상태와 팀 순위 데이터를 수집하고, 이를 이벤트 기반 백엔드 파이프라인으로 전달하는 흐름을 구현하는 것이다.

초기 단계에서는 Mock Game Event를 사용해 Kafka, WebSocket, Chrome Extension 흐름을 먼저 검증한다. 이후 KBO 공식 스코어보드와 팀 순위 데이터를 수집하는 Collector로 교체한다.

---

## 구현 기능 / 예정 기능

### 구현 완료

* Mock 야구 경기 이벤트 생성
* Kafka Producer를 통한 경기 이벤트 발행
* Kafka Consumer를 통한 경기 이벤트 처리
* WebSocket 기반 실시간 이벤트 전송
* Chrome Extension Popup UI
* 응원 팀 선택
* KBO 공식 스코어보드 데이터 수집
* KBO 공식 팀 순위 데이터 수집
* 스코어보드 점수 / 경기 상태 변경 감지
* 스코어보드 기반 `GameEvent` 변환
* `KBO_SNAPSHOT` 기반 현재 경기 상태 전달
* 선택 팀 기준 경기 정보 표시
* 선택 팀 기준 순위 / 시즌 성적 / 승률 / 게임차 표시

### 구현 예정

* Popup UX / 팀 선택 유지 개선
* Docker Compose 실행 정리
* README / 시연 문서화

---

## 기술 스택

* Node.js
* TypeScript
* Apache Kafka
* KafkaJS
* WebSocket
* Chrome Extension Manifest V3
* Docker Compose
* cheerio

---

## 전체 구조

```text
KBO 공식 사이트
  ├─ 스코어보드
  └─ 팀 순위
        ↓
Backend Collector
        ├─ KBO_SNAPSHOT
        │     ↓
        │   WebSocket Server
        │     ↓
        │   Chrome Extension Popup
        │
        └─ GameEvent
              ↓
            Kafka Producer
              ↓
            Kafka
              ↓
            Kafka Consumer
              ↓
            WebSocket Server
              ↓
            Chrome Extension Popup
```

### 초기 Mock 기반 검증 흐름

```text
Mock Game Event Generator
    ↓
Kafka Producer
    ↓
baseball.game.events Topic
    ↓
Kafka Consumer
    ↓
WebSocket Server
    ↓
Chrome Extension Popup
```

---

## 프로젝트 구조

```text
baseball-live-tracker
├─ backend
│  ├─ src
│  │  ├─ collector
│  │  ├─ websocket
│  │  ├─ producer
│  │  ├─ consumer
│  │  ├─ events
│  │  ├─ kafka
│  │  └─ config
│  ├─ package.json
│  └─ tsconfig.json
│
├─ extension
│  └─ public
│     ├─ manifest.json
│     ├─ popup.html
│     ├─ popup.css
│     └─ popup.js
│
├─ infra
│  └─ docker-compose.yml
│
├─ .gitignore
└─ README.md
```

---

## 디렉터리 역할

### backend
- KBO 스코어보드 / 팀 순위 데이터 수집
- 경기 이벤트 모델 관리
- Kafka Producer / Consumer
- WebSocket Server

### extension
- Chrome Extension Popup UI
- WebSocket 메시지 수신
- 선택 팀 경기 정보 표시
- 선택 팀 순위 / 시즌 성적 / 승률 / 게임차 표시
- WebSocket 연결 상태 표시

### infra
- Kafka 로컬 실행 환경
- Docker Compose 구성

---

## 이벤트 데이터 모델

Backend에서 생성한 경기 이벤트는 Kafka를 거쳐 WebSocket으로 Chrome Extension Popup에 전달된다.

Mock 단계에서는 전체 이벤트 타입을 사용할 수 있다.

KBO 스코어보드 Collector 연동 이후에는 스코어보드에서 안정적으로 확인 가능한 이벤트만 생성한다.

### 이벤트 타입

```ts
export type GameEventType =
  | "GAME_START"
  | "GAME_END"
  | "SCORE"
  | "HOME_RUN"
  | "OUT_COUNT_CHANGE"
  | "PITCHER_CHANGE"
  | "BATTER_CHANGE"
  | "INNING_CHANGE"
  | "ERROR";
```

### 실제 Collector 생성 이벤트

| 이벤트 타입             | 생성 여부 | 기준                          |
| ------------------ | ----- | --------------------------- |
| `SCORE`            | 생성    | 이전 점수보다 현재 점수가 증가           |
| `GAME_END`         | 생성    | 이전 상태가 종료 전이고 현재 상태가 종료     |
| `ERROR`            | 생성    | 수집 또는 파싱 실패                 |
| `GAME_START`       | 보류    | 스코어보드 상태 표현이 안정적으로 확인된 뒤 검토 |
| `HOME_RUN`         | 제외    | 스코어보드만으로 판정 불가              |
| `OUT_COUNT_CHANGE` | 제외    | 스코어보드에서 제공하지 않음             |
| `PITCHER_CHANGE`   | 제외    | 문자중계 없이 안정 판정 불가            |
| `BATTER_CHANGE`    | 제외    | 문자중계 없이 안정 판정 불가            |
| `INNING_CHANGE`    | 제외    | 현재 이닝 전환을 안정적으로 판정하기 어려움    |

### 경기 이벤트 구조

KBO 스코어보드만으로는 현재 이닝, 초/말, 아웃카운트를 항상 확인할 수 없다.

따라서 실제 Collector 연동 이후에는 해당 필드를 nullable로 둔다.

```ts
export type InningHalf = "TOP" | "BOTTOM";

export type GameEvent = {
  gameId: string;
  inning: number | null;
  inningHalf: InningHalf | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  outCount: number | null;
  eventType: GameEventType;
  message: string;
  timestamp: string;
};
```

---

## Kafka Producer / Consumer

Mock 경기 이벤트를 Kafka Topic에 발행하고, Consumer가 해당 Topic에서 이벤트를 소비한다.

```text
Mock Game Event Generator
    ↓
Kafka Producer
    ↓
baseball.game.events Topic
    ↓
Kafka Consumer
```

### Kafka Topic

```text
baseball.game.events
```

### Kafka 메시지 기준

* Kafka message key는 `gameId`를 사용한다.
* Kafka message value는 `GameEvent` JSON 문자열을 사용한다.
* Consumer는 Kafka message value를 `GameEvent`로 파싱한 뒤 WebSocket Server로 전달한다.

---

## WebSocket 실시간 이벤트 반영

Kafka Consumer가 소비한 `GameEvent`는 WebSocket Server를 통해 Chrome Extension Popup으로 broadcast된다.

KBO Collector가 수집한 현재 경기 상태와 팀 순위 데이터는 `KBO_SNAPSHOT`으로 WebSocket Server에 전달된다.

```text
GameEvent
→ Kafka Consumer
→ WebSocket Server
→ Chrome Extension Popup
```

```text
KBO_SNAPSHOT
→ WebSocket Server
→ Chrome Extension Popup
```

Popup에서는 아래 항목을 표시한다.

- WebSocket 연결 상태
- 응원 팀 선택
- 경기 상태
- 경기 날짜
- 원정 팀 / 원정 점수
- 홈 팀 / 홈 점수
- 구장
- 경기 시간
- 선택 팀 순위
- 시즌 성적
- 승률 / 게임차

`GAME_EVENT`는 선택 팀 경기의 실시간 점수 갱신에 사용하고, `KBO_SNAPSHOT`은 Popup이 열렸을 때 현재 경기 정보와 순위 정보를 채우는 데 사용한다.


---

## KBO 데이터 출처 및 수집 범위

### 수집 출처

```text
KBO 스코어보드:
https://www.koreabaseball.com/Schedule/Scoreboard.aspx

KBO 팀 순위:
https://www.koreabaseball.com/Record/TeamRank/TeamRankDaily.aspx
```

### 스코어보드 수집 대상

- 경기 날짜
- 경기 시간
- 구장
- 원정 팀
- 홈 팀
- 원정 팀 점수
- 홈 팀 점수
- 경기 상태
- 이닝별 점수
- R / H / E / B
- 승리 투수 텍스트
- 패전 투수 텍스트
- 세이브 투수 텍스트

### 팀 순위 수집 대상

- 기준일
- 순위
- 팀명
- 경기 수
- 승
- 패
- 무
- 승률
- 게임차
- 최근 10경기
- 연속
- 홈 성적
- 방문 성적

### 수집 기준

- 로그인 없이 접근 가능한 공개 HTML만 사용한다.
- 내부 API나 /ws/ 경로를 직접 호출하지 않는다.
- 네이버 스포츠, KBO 모바일, KBO 영문 사이트는 수집하지 않는다.
- 게임센터와 문자중계는 수집하지 않는다.
- 영상, 이미지, 로고, 선수 사진은 수집하지 않는다.
- 전체 시즌 데이터를 대량 저장하지 않는다.
- 학습용 로컬 프로젝트 범위에서만 사용한다.

---

## KBO 데이터 수집 흐름

KBO 공식 스코어보드와 팀 순위 HTML을 수집해 Chrome Extension Popup에 현재 선택 팀의 경기 정보와 순위 정보를 표시한다.

```text
KBO 스코어보드 / 팀 순위
→ KboCollector
→ KBO_SNAPSHOT
→ WebSocket Server
→ Chrome Extension Popup
```

```text
KBO 스코어보드 변경 감지
→ GameEvent 생성
→ Kafka Producer
→ Kafka
→ Kafka Consumer
→ WebSocket Server
→ Chrome Extension Popup
```

### 수집 및 표시 기준
- 스코어보드는 .smsScore 기준으로 경기 블록을 파싱한다.
- 경기전 상태의 빈 점수는 0으로 처리한다.
- 빈 H / E / B 값은 null로 처리한다.
- 팀 순위는 table.tData 중 순위 / 팀명 / 승률 summary가 있는 테이블만 사용한다.
- 팀 순위 데이터는 Kafka 이벤트로 발행하지 않는다.
- 팀 순위 데이터는 KBO_SNAPSHOT payload에 포함한다.
- WebSocket Server는 최신 KBO_SNAPSHOT을 저장하고 새 Popup 연결 시 replay한다.
- Popup은 선택 팀의 경기 정보와 순위 정보를 표시한다.

---

## 실행 방법

### 1. Kafka 실행

```powershell
cd ./baseball-live-tracker

docker compose -f infra/docker-compose.yml up -d
```

### 2. Backend 실행

```powershell
cd ./baseball-live-tracker/backend

pnpm dev
```

### 3. Chrome Extension 확인

1. Chrome 주소창에 chrome://extensions 입력
2. 개발자 모드 활성화
3. 압축해제된 확장 프로그램 로드
4. extension/public 선택
5. Baseball Live Tracker Popup 열기

### 4. 종료

Backend 터미널에서 `Ctrl + C`를 누른다.

Kafka 컨테이너를 종료한다.

```powershell
cd ./baseball-live-tracker

docker compose -f infra/docker-compose.yml down
```

---

## 환경 변수

Backend는 `.env` 파일을 `node --env-file=.env` 옵션으로 로드한다.

`backend/.env` 예시:

```env
KAFKA_CLIENT_ID=baseball-game-kadka
KAFKA_BROKERS=localhost:9092
KAFKA_GAME_EVENTS_TOPIC=baseball.game.events
KAFKA_CONSUMER_GROUP_ID=baseball-game-event-consumer

WEBSOCKET_PORT=4000

KBO_SCOREBOARD_URL=https://www.koreabaseball.com/Schedule/Scoreboard.aspx
KBO_TEAM_RANK_URL=https://www.koreabaseball.com/Record/TeamRank/TeamRankDaily.aspx
KBO_COLLECTOR_INTERVAL_MS=30000
```

### 기준
- KBO URL은 TypeScript 코드에 기본값으로 두지 않는다.
- KBO 스코어보드 URL은 KBO_SCOREBOARD_URL로 관리한다.
- KBO 팀 순위 URL은 KBO_TEAM_RANK_URL로 관리한다.
- KBO Collector polling 간격은 KBO_COLLECTOR_INTERVAL_MS로 관리한다.
- KBO_COLLECTOR_INTERVAL_MS는 30000ms 이상으로 설정한다.
- .env 파일은 Git에 포함하지 않는다.

---

## 진행 단계

* [x] Phase 1. 프로젝트 초기 구성
* [x] Phase 2. Chrome Extension 기본 UI
* [x] Phase 3. Mock WebSocket Server
* [x] Phase 4. Mock 경기 이벤트 생성
* [x] Phase 5. Kafka Producer / Consumer
* [x] Phase 6. WebSocket 실시간 이벤트 반영
* [x] Phase 7. KBO 데이터 출처 조사 및 수집 범위 확정
* [x] Phase 8. KBO 스코어보드 / 팀 순위 Collector 구현
* [ ] Phase 9. Popup UX / 팀 선택 유지 개선
* [ ] Phase 10. Docker Compose 실행 정리
* [ ] Phase 11. README / 시연 문서화

---

## 제외 범위

초기 MVP에서는 아래 항목을 구현하지 않는다.

- 외부 사이트 무단 크롤링
- 네이버 스포츠 수집
- KBO 게임센터 수집
- KBO 문자중계 수집
- 비공식 API 호출
- /ws/ 하위 경로 직접 호출
- 로그인 기능
- 사용자 계정 관리
- Chrome Notification
- Background Service Worker
- chrome.storage 영구 저장
- 선수별 상세 기록 수집
- 홈런 / 투수 교체 / 타자 교체 판정
- 볼카운트 / 아웃카운트 / 주자 상황 수집
- 배포용 Chrome Web Store 등록
- 대규모 트래픽 처리
- Kubernetes 구성
- Prometheus / Grafana 모니터링
- 머신러닝 기반 경기 예측

