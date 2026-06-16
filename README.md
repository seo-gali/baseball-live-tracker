# Baseball Live Tracker

> KBO 경기 데이터를 기반으로 Kafka와 WebSocket을 통해 실시간 경기 이벤트를 Chrome Extension에 전달하는 학습용 프로젝트

## 개요

Baseball Live Tracker는 KBO 경기 데이터를 수집하고, Kafka 기반 이벤트 파이프라인을 통해 처리한 뒤 WebSocket으로 Chrome Extension에 실시간 전달하는 학습용 프로젝트다.

이 프로젝트는 단순한 경기 정보 조회 앱이 아니라, 경기 데이터 수집, 메시지 큐 기반 비동기 처리, WebSocket 브로드캐스트, Chrome Extension 표시, 브라우저 알림 흐름을 단계적으로 구현하는 것을 목표로 한다.

초기 단계에서는 Mock Game Event를 사용해 Kafka, WebSocket, Chrome Extension 흐름을 먼저 검증한다. 이후 KBO 공식 경기 데이터 연동을 통해 실제 경기 일정, 경기 상태, 스코어, 주요 이벤트를 처리하는 구조로 확장한다.

---

## 구현 기능 / 예정 기능

### 구현 완료

* Mock 야구 경기 이벤트 생성
* Kafka Producer를 통한 경기 이벤트 발행
* Kafka Consumer를 통한 이벤트 처리
* WebSocket 기반 실시간 이벤트 전송
* Chrome Extension Popup UI
* 응원 팀 선택
* 실시간 스코어 표시

### 구현 예정

* KBO 공식 경기 데이터 연동
* 경기 일정 및 경기 상태 수집
* 득점, 홈런, 선수 교체 등 주요 이벤트 알림
* 최근 경기 이벤트 로그 저장

---

## 기술 스택

* Node.js
* TypeScript
* Apache Kafka
* KafkaJS
* WebSocket
* Chrome Extension Manifest V3
* Docker Compose

---

## 전체 구조

```text
KBO Game Data
    ↓
Backend Collector
    ↓
Backend Producer
    ↓
Kafka
    ↓
Backend Consumer
    ↓
WebSocket Server
    ↓
Chrome Extension
    ↓
Popup / Notification
```

### 현재 Mock 기반 검증 흐름

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
│  │  ├─ api
│  │  ├─ websocket
│  │  ├─ collector
│  │  ├─ producer
│  │  ├─ consumer
│  │  ├─ events
│  │  ├─ kafka
│  │  └─ config
│  ├─ test
│  ├─ package.json
│  └─ tsconfig.json
│
├─ extension
│  ├─ src
│  │  ├─ popup
│  │  ├─ background
│  │  ├─ storage
│  │  └─ notifications
│  ├─ public
│  │  ├─ manifest.json
│  │  ├─ popup.html
│  │  ├─ popup.css
│  │  └─ popup.js
│  ├─ package.json
│  └─ tsconfig.json
│
├─ infra
│  └─ docker-compose.yml
│
├─ .gitignore
└─ README.md
```

---

## 디렉터리 역할

```text
backend
- KBO 경기 데이터 수집
- Kafka Producer / Consumer
- WebSocket Server
- API Server
- 경기 이벤트 모델 관리

extension
- Chrome Extension
- Popup UI
- Background Service Worker
- 알림 처리
- 로컬 상태 저장

infra
- Kafka 로컬 실행 환경
- Docker Compose 구성

README.md
- 프로젝트 소개
- 실행 방법
- 구조 설명
```

---

## 이벤트 데이터 모델

Backend에서 생성한 경기 이벤트는 WebSocket을 통해 Chrome Extension으로 전달된다.

Mock 경기 이벤트는 Kafka Producer를 통해 `baseball.game.events` Topic에 발행된다.    
Kafka Consumer는 해당 이벤트를 소비한 뒤 WebSocket Server로 전달하고,    
WebSocket Server는 동일한 `GameEvent` 구조를 Chrome Extension Popup에 broadcast한다.

### 이닝 구분

```ts
// TOP: 초, BOTTOM: 말
export type InningHalf = "TOP" | "BOTTOM";
```

### 이벤트 타입

```ts
// 백엔드 내부에서 사용할 경기 이벤트 타입 목록
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

| 이벤트 타입             | 설명        |
| ------------------ | --------- |
| `GAME_START`       | 경기 시작     |
| `GAME_END`         | 경기 종료     |
| `SCORE`            | 득점        |
| `HOME_RUN`         | 홈런        |
| `OUT_COUNT_CHANGE` | 아웃카운트 변경  |
| `PITCHER_CHANGE`   | 투수 교체     |
| `BATTER_CHANGE`    | 타자 교체     |
| `INNING_CHANGE`    | 이닝 변경     |
| `ERROR`            | 이벤트 처리 오류 |

### 경기 이벤트 구조

```ts
// WebSocket으로 Extension에 전달할 경기 이벤트 표준 구조
export type GameEvent = {
  gameId: string;
  inning: number;
  inningHalf: InningHalf;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  outCount: number;
  eventType: GameEventType;
  message: string;
  timestamp: string;
};
```

| 필드           | 설명                            |
| ------------ | ----------------------------- |
| `gameId`     | 경기 식별자                        |
| `inning`     | 현재 이닝                         |
| `inningHalf` | 초/말 구분                        |
| `homeTeam`   | 홈 팀                           |
| `awayTeam`   | 원정 팀                          |
| `homeScore`  | 홈 팀 점수                        |
| `awayScore`  | 원정 팀 점수                       |
| `outCount`   | 현재 아웃카운트                      |
| `eventType`  | 경기 이벤트 타입                     |
| `message`    | Chrome Extension에 표시할 사용자 메시지 |
| `timestamp`  | 이벤트 생성 시각                     |


#### 이벤트 예시

```json
{
  "gameId": "2026-06-12-LG-DOO",
  "inning": 7,
  "inningHalf": "TOP",
  "homeTeam": "DOO",
  "awayTeam": "LG",
  "homeScore": 3,
  "awayScore": 5,
  "outCount": 1,
  "eventType": "SCORE",
  "message": "LG 7회초 1득점",
  "timestamp": "2026-06-12T10:21:00Z"
}
```

---

## Kafka Producer / Consumer

Mock 경기 이벤트를 Kafka Topic에 발행하고, Consumer가 해당 Topic에서 이벤트를 소비하는 흐름 구현

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

### Kafka 메시지 구조

Kafka message value는 기존 `GameEvent` 모델을 JSON 문자열로 직렬화한 값이다.

```json
{
  "gameId": "2026-06-15-LG-DOO",
  "inning": 1,
  "inningHalf": "TOP",
  "homeTeam": "DOO",
  "awayTeam": "LG",
  "homeScore": 0,
  "awayScore": 0,
  "outCount": 0,
  "eventType": "GAME_START",
  "message": "경기 시작: LG vs DOO",
  "timestamp": "2026-06-15T13:58:28.866Z"
}
```

Kafka message key는 `gameId`를 사용한다.

### 로컬 Kafka 실행

```powershell
cd ./baseball-live-tracker

docker compose -f infra/docker-compose.yml up -d
```

Kafka 컨테이너 상태 확인:

```powershell
docker ps
```

Topic 목록 확인:

```powershell
docker exec -it baseball-live-tracker-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list
```

### Kafka Producer / Consumer 실행

```powershell
cd ./baseball-live-tracker/backend

pnpm dev:kafka
```

정상 동작 시 Producer가 Mock 경기 이벤트를 발행하고, Consumer가 같은 이벤트를 소비한다.

```text
[kafka-admin] topic created: baseball.game.events
[kafka-consumer] connected. groupId=baseball-live-tracker-game-event-consumer
[kafka-consumer] subscribed. topic=baseball.game.events
[kafka-producer] connected
[kafka-producer] GAME_START: 경기 시작: LG vs DOO
[kafka-consumer] baseball.game.events[0|0] GAME_START: 경기 시작: LG vs DOO
```

### Kafka Topic 상세 확인

```powershell
docker exec -it baseball-live-tracker-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic baseball.game.events
```

#### 정상 기준

```text
Topic: baseball.game.events
PartitionCount: 1
ReplicationFactor: 1
```

### Kafka CLI Consumer 확인

```powershell
docker exec -it baseball-live-tracker-kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic baseball.game.events --from-beginning
```

#### 정상 기준

Kafka CLI Consumer는 Kafka message value를 그대로 출력하므로 `GameEvent` JSON 문자열이 표시된다.

```json
{"gameId":"2026-06-15-LG-DOO","inning":1,"inningHalf":"TOP","homeTeam":"DOO","awayTeam":"LG","homeScore":0,"awayScore":0,"outCount":0,"eventType":"GAME_START","message":"경기 시작: LG vs DOO","timestamp":"..."}
```

### Kafka 종료

```powershell
cd ./baseball-live-tracker

docker compose -f infra/docker-compose.yml down
```

---

## WebSocket 실시간 이벤트 반영

Kafka Consumer가 소비한 경기 이벤트를 WebSocket Server로 전달하고, WebSocket Server가 Chrome Extension Popup으로 이벤트를 실시간 broadcast한다.

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

## 실시간 파이프라인 실행

### 1. 터미널 1에서 Kafka 실행

```powershell
cd ./baseball-live-tracker

docker compose -f infra/docker-compose.yml up -d
```

### 2. 터미널 2에서 backend 실행

```powershell
cd ./baseball-live-tracker/backend

pnpm dev
```

#### 정상 로그 예시

```
[websocket] server listening on ws://localhost:4000
[kafka-admin] topic created: baseball.game.events
[kafka-consumer] connected. groupId=baseball-live-tracker-game-event-consumer
[kafka-consumer] subscribed. topic=baseball.game.events
[kafka-producer] connected
[kafka-producer] GAME_START: 경기 시작: LG vs DOO
[mock-kafka-producer] started. interval=3000ms
[backend] realtime pipeline started
[backend] flow: Mock Producer → Kafka → Consumer → WebSocket → Popup
```

### 3. Chrome Extension Popup을 열면 WebSocket client가 연결

```
[websocket] client connected: ...
[websocket] client message from ...: { type: 'SUBSCRIBE_TEAM', payload: { team: 'LG' } }
```

### 4. Kafka 이벤트가 Consumer를 거쳐 WebSocket으로 전달되면 로그 출력

```
[kafka-consumer] baseball.game.events[0|2] SCORE: LG 1회초 선취 득점
[realtime] consumed SCORE: LG 1회초 선취 득점. websocketClients=1
[websocket] broadcast SCORE: LG 1회초 선취 득점. clients=1
```

### 5. Chrome Extension 확인

1. Chrome 주소창에 chrome://extensions 입력
2. Baseball Live Tracker 확장 프로그램 새로고침
3. Chrome Toolbar에서 확장 프로그램 아이콘 클릭
4. Popup에서 WebSocket 연결 완료 확인
5. 점수, 이닝, 아웃카운트, 최근 이벤트 로그가 실시간 갱신되는지 확인

#### 정상 기준
- WebSocket 연결 상태가 표시된다.
- Kafka를 거친 이벤트가 Popup 최근 이벤트 로그에 표시된다.
- 경기 점수, 현재 이닝, 아웃카운트가 이벤트 payload 기준으로 갱신된다.
- Popup을 닫았다가 다시 열면 WebSocket client가 새로 연결된다.

### 6. 실시간 파이프라인 종료

backend 터미널에서 `Ctrl + C`를 누른다.

#### 정상 로그

```
[backend] shutting down. signal=SIGINT
[kafka-producer] disconnected
[mock-kafka-producer] stopped
[kafka-consumer] disconnected
[websocket] server closed
```

### 7. Kafka 컨테이너를 종료

```powershell
cd ./baseball-live-tracker

docker compose -f infra/docker-compose.yml down
```

---

## KBO 데이터 출처 및 수집 범위

### 최종 수집 출처

```text
https://www.koreabaseball.com/Schedule/ScoreBoard.aspx
```

### 수집 방식
- KBO 공식 스코어보드 HTML을 주기적으로 조회
- 이전 경기 상태 snapshot과 현재 snapshot을 비교해 이벤트 생성

```text
KBO 공식 스코어보드
    ↓
KboScoreboardCollector
    ↓
KboScoreboardParser
    ↓
KboGameSnapshot
    ↓
KboGameEventFactory
    ↓
Kafka Producer
```

### 수집 대상

스코어보드 HTML에서 확인 가능한 항목만 수집

```text
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
```

### 이벤트 변환 범위

```text
- GAME_START
- GAME_END
- SCORE
- ERROR
```

### 수집 제외 기준

```text
- 네이버 스포츠 수집 제외
- KBO 모바일 사이트 수집 제외
- KBO 영문 사이트 수집 제외
- KBO 게임센터 수집 제외
- KBO 문자중계 수집 제외
- /ws/ 내부 경로 직접 호출 제외
- 로그인 기반 데이터 수집 제외
- 영상, 이미지, 로고, 선수 사진 수집 제외
- 전체 시즌 데이터 대량 저장 제외
```

### 구현 기준

- 스코어보드에서 확인되지 않는 값은 임의로 만들지 않는다. 
- 현재 이닝, 초/말, 아웃카운트처럼 스코어보드에서 안정적으로 확인할 수 없는 필드는 `null`로 처리하거나 Popup에서 `-`로 표시한다.

---

## 진행 단계

* [x] Phase 1. 프로젝트 초기 구성
* [x] Phase 2. Chrome Extension 기본 UI
* [x] Phase 3. Mock WebSocket Server
* [x] Phase 4. Mock 경기 이벤트 생성
* [x] Phase 5. Kafka Producer / Consumer
* [x] Phase 6. WebSocket 실시간 이벤트 반영
* [x] Phase 7. KBO 데이터 출처 조사 및 수집 범위 확정
* [ ] Phase 8. KBO 경기 데이터 Collector 구현
* [ ] Phase 9. 알림 / 팀 즐겨찾기
* [ ] Phase 10. Docker Compose 구성
* [ ] Phase 11. README / 시연 문서화

---

## 제외 범위

초기 MVP에서는 아래 항목을 구현하지 않는다.

```text
- 외부 사이트 무단 크롤링
- 로그인 기능
- 사용자 계정 관리
- Chrome Web Store 배포
- 대규모 트래픽 처리
- Kubernetes 구성
- Prometheus / Grafana 모니터링
- 머신러닝 기반 경기 예측
```

KBO 공식 데이터 연동은 제외 범위가 아니다. 다만 실제 연동 전에는 데이터 출처, 요청 방식, 호출 주기, 저장 범위, 이용 조건을 먼저 확인한다.