# Baseball Live Tracker

> KBO 경기 데이터를 기반으로 Kafka와 WebSocket을 통해 실시간 경기 이벤트를 Chrome Extension에 전달하는 학습용 프로젝트

## 개요

Baseball Live Tracker는 KBO 경기 데이터를 수집하고, Kafka 기반 이벤트 파이프라인을 통해 처리한 뒤 WebSocket으로 Chrome Extension에 실시간 전달하는 학습용 프로젝트다.

이 프로젝트는 단순한 경기 정보 조회 앱이 아니라, 경기 데이터 수집, 메시지 큐 기반 비동기 처리, WebSocket 브로드캐스트, Chrome Extension 표시, 브라우저 알림 흐름을 단계적으로 구현하는 것을 목표로 한다.

초기 단계에서는 Mock Game Event를 사용해 Kafka, WebSocket, Chrome Extension 흐름을 먼저 검증한다. 이후 KBO 공식 경기 데이터 연동을 통해 실제 경기 일정, 경기 상태, 스코어, 주요 이벤트를 처리하는 구조로 확장한다.

---

## 구현 예정 기능

* Mock 야구 경기 이벤트 생성
* KBO 공식 경기 데이터 연동
* 경기 일정 및 경기 상태 수집
* Kafka Producer를 통한 경기 이벤트 발행
* Kafka Consumer를 통한 이벤트 처리
* WebSocket 기반 실시간 이벤트 전송
* Chrome Extension Popup UI
* 응원 팀 선택
* 실시간 스코어 표시
* 득점, 홈런, 선수 교체 등 주요 이벤트 알림
* 최근 경기 이벤트 로그 저장

---

## 기술 스택

* Node.js
* TypeScript
* Kafka
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

Phase 3에서는 Mock WebSocket Server가 아래 구조를 가진 Mock 경기 이벤트를 Popup으로 전송한다. 이후 Kafka Producer / Consumer를 추가할 때도 동일한 이벤트 모델을 기준으로 메시지를 발행하고 소비한다.

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

## 진행 단계

* [x] Phase 1. 프로젝트 초기 구성
* [x] Phase 2. Chrome Extension 기본 UI
* [x] Phase 3. Mock WebSocket Server
* [ ] Phase 4. Mock 경기 이벤트 생성
* [ ] Phase 5. Kafka Producer / Consumer
* [ ] Phase 6. WebSocket 실시간 이벤트 반영
* [ ] Phase 7. KBO 데이터 출처 조사 및 수집 범위 확정
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