# Baseball Live Tracker

> KBO 공식 스코어보드와 팀 순위 데이터를 기반으로 Kafka와 WebSocket을 통해 경기 상태를 Chrome Extension Popup에 전달하는 학습용 프로젝트

## 개요

Baseball Live Tracker는 KBO 공식 사이트의 스코어보드와 팀 순위 데이터를 수집하고, Kafka 기반 이벤트 파이프라인을 통해 처리한 뒤 WebSocket으로 Chrome Extension Popup에 전달하는 학습용 프로젝트다.

이 프로젝트는 전체 야구 기록 서비스나 문자중계 서비스가 아니다.

**목표는 KBO 공식 사이트의 공개 HTML에서 확인 가능한 경기 상태와 팀 순위 데이터를 수집하고, 이를 이벤트 기반 백엔드 파이프라인으로 전달하는 흐름을 구현하는 것이다.**

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
* Popup 선택 팀 localStorage 저장 / 복원
* 선택 팀이 없는 경우 전체 경기 목록 표시
* 진행 중 경기의 공격 팀 / 아웃카운트 / 주자 상황 표시
* KBO 다이아고딕 기반 Popup UI 스타일 적용
* Docker Compose 기반 Kafka / Backend 통합 실행

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

### Docker Compose 실행 구조

```text
Docker Compose
├─ kafka
│  ├─ Docker 내부 접근: kafka:9092
│  └─ Host PC 접근: localhost:9092
│
└─ backend
   ├─ Kafka Broker: kafka:9092
   ├─ WebSocket Server: 0.0.0.0:4000
   └─ Host 노출: localhost:4000

Chrome Extension Popup
└─ ws://localhost:4000 연결
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
│  ├─ Dockerfile
│  ├─ .dockerignore
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

* KBO 스코어보드 / 팀 순위 데이터 수집
* 경기 이벤트 모델 관리
* Kafka Producer / Consumer
* WebSocket Server
* Docker 이미지 빌드 대상

### extension

* Chrome Extension Popup UI
* WebSocket 메시지 수신
* 선택 팀 localStorage 저장 / 복원
* 선택 팀 경기 정보 표시
* 선택 팀 순위 / 시즌 성적 / 승률 / 게임차 표시
* 선택 팀이 없는 경우 전체 경기 목록 표시
* 진행 중 경기의 공격 팀 / 아웃카운트 / 주자 상황 표시
* WebSocket 연결 상태 표시

### infra

* Kafka 로컬 실행 환경
* Backend 컨테이너 실행 환경
* Docker Compose 구성

---

## 이벤트 데이터 모델

- Backend에서 생성한 경기 이벤트는 Kafka를 거쳐 WebSocket으로 Chrome Extension Popup에 전달된다.
- Mock 단계에서는 전체 이벤트 타입을 사용할 수 있다.
- KBO 스코어보드 Collector 연동 이후에는 스코어보드에서 안정적으로 확인 가능한 이벤트만 생성한다.

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

| 이벤트 타입             | 생성 여부 | 기준                             |
| ------------------ | ----- | ------------------------------ |
| `SCORE`            | 생성    | 이전 점수보다 현재 점수가 증가              |
| `GAME_END`         | 생성    | 이전 상태가 종료 전이고 현재 상태가 종료        |
| `ERROR`            | 생성    | 수집 또는 파싱 실패                    |
| `GAME_START`       | 보류    | 스코어보드 상태 표현이 안정적으로 확인된 뒤 검토    |
| `HOME_RUN`         | 제외    | 스코어보드만으로 판정 불가                 |
| `OUT_COUNT_CHANGE` | 제외    | 문자중계 없이 독립 이벤트로 안정 판정하지 않음     |
| `INNING_CHANGE`    | 제외    | 현재 이닝은 표시할 수 있으나 독립 이벤트 생성은 제외 |
| `PITCHER_CHANGE`   | 제외    | 문자중계 없이 안정 판정 불가               |
| `BATTER_CHANGE`    | 제외    | 문자중계 없이 안정 판정 불가               |

### 경기 이벤트 구조

- KBO 스코어보드만으로는 현재 이닝, 초/말, 아웃카운트를 항상 확인할 수 없다.
- 실제 Collector 연동 이후에는 해당 필드를 nullable로 둔다.

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

Mock 경기 이벤트 또는 KBO Collector가 생성한 `GameEvent`를 Kafka Topic에 발행하고, Consumer가 해당 Topic에서 이벤트를 소비한다.

```text
GameEvent
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
* Topic은 애플리케이션 Admin Client에서 명시적으로 생성한다.
* Kafka Topic 자동 생성은 사용하지 않는다.

---

## WebSocket 실시간 이벤트 반영

- Kafka Consumer가 소비한 `GameEvent`는 WebSocket Server를 통해 Chrome Extension Popup으로 broadcast된다.
- KBO Collector가 수집한 현재 경기 상태와 팀 순위 데이터는 `KBO_SNAPSHOT`으로 WebSocket Server에 전달된다.

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

### Popup 표시 항목

* WebSocket 연결 상태
* 응원 팀 선택
* 마지막 선택 팀 자동 복원
* 전체 경기 목록
* 경기 상태
* 경기 날짜
* 원정 팀 / 원정 점수
* 홈 팀 / 홈 점수
* 구장
* 경기 시간
* 진행 중 경기의 공격 팀
* 진행 중 경기의 아웃카운트
* 진행 중 경기의 주자 상황
* 선택 팀 순위
* 시즌 성적
* 승률 / 게임차

> `GAME_EVENT`는 선택 팀 경기의 실시간 점수와 경기중 상태 보정에 사용하고, `KBO_SNAPSHOT`은 Popup이 열렸을 때 현재 경기 정보와 순위 정보를 채우는 데 사용한다.

---

## KBO 데이터 출처 및 수집 범위

### 수집 출처

#### KBO 스코어보드
```
https://www.koreabaseball.com/Schedule/Scoreboard.aspx
```

#### KBO 팀 순위
```
https://www.koreabaseball.com/Record/TeamRank/TeamRankDaily.aspx
```

### 스코어보드 수집 대상

* 경기 날짜
* 경기 시간
* 구장
* 원정 팀
* 홈 팀
* 원정 팀 점수
* 홈 팀 점수
* 경기 상태
* 이닝별 점수
* R / H / E / B
* 승리 투수 텍스트
* 패전 투수 텍스트
* 세이브 투수 텍스트

### 팀 순위 수집 대상

* 기준일
* 순위
* 팀명
* 경기 수
* 승
* 패
* 무
* 승률
* 게임차
* 최근 10경기
* 연속
* 홈 성적
* 방문 성적

### 수집 기준

* 로그인 없이 접근 가능한 공개 HTML만 사용한다.
* 내부 API나 `/ws/` 경로를 직접 호출하지 않는다.
* 네이버 스포츠, KBO 모바일, KBO 영문 사이트는 수집하지 않는다.
* 게임센터와 문자중계는 수집하지 않는다.
* 영상, 이미지, 로고, 선수 사진은 수집하지 않는다.
* 전체 시즌 데이터를 대량 저장하지 않는다.
* 학습용 로컬 프로젝트 범위에서만 사용한다.

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

* 스코어보드는 `.smsScore` 기준으로 경기 블록을 파싱한다.
* 경기전 상태의 빈 점수는 0으로 처리한다.
* 빈 H / E / B 값은 null로 처리한다.
* 팀 순위는 `table.tData` 중 순위 / 팀명 / 승률 summary가 있는 테이블만 사용한다.
* 팀 순위 데이터는 Kafka 이벤트로 발행하지 않는다.
* 팀 순위 데이터는 `KBO_SNAPSHOT` payload에 포함한다.
* WebSocket Server는 최신 `KBO_SNAPSHOT`을 저장하고 새 Popup 연결 시 replay한다.
* Popup은 선택 팀의 경기 정보와 순위 정보를 표시한다.
* Popup은 사용자가 마지막으로 선택한 팀을 `localStorage`에 저장하고 다음 실행 시 복원한다.
* 선택 팀이 없는 경우 Popup은 전체 경기 목록을 표시한다.
* `KBO_SNAPSHOT` 또는 `GAME_EVENT`에 경기중 상태 값이 포함되어 있으면 Popup은 공격 팀 / 아웃카운트 / 주자 상황을 표시한다.

---

## 실행 방법

### 1. 환경 변수 파일 준비

`backend/.env` 파일을 생성한다.

필요한 변수 목록과 기준은 아래 `환경 변수` 섹션을 따른다.

### 2. Kafka / Backend 실행

```powershell
cd ./baseball-live-tracker

docker compose -f infra/docker-compose.yml up -d --build
```

#### 정상 기준

- baseball-live-tracker-kafka 컨테이너가 실행된다.
- baseball-live-tracker-backend 컨테이너가 실행된다.
- Kafka는 host PC에서 확인할 수 있다.
- Backend WebSocket Server는 host PC의 localhost:4000으로 노출된다.

### 3. 로그 확인

#### Backend 로그
```powershell
docker compose -f infra/docker-compose.yml logs -f backend
```

### Kafka 로그
```powershell
docker compose -f infra/docker-compose.yml logs -f kafka
```

### 4. Chrome Extension 확인

1. Chrome 주소창에 chrome://extensions 입력
2. 개발자 모드 활성화
3. 압축해제된 확장 프로그램 로드
4. extension/public 선택
5. Baseball Live Tracker Popup 열기

#### 정상 기준
- Popup이 ws://localhost:4000으로 WebSocket Server에 연결된다.
- WebSocket 연결 상태가 표시된다.
- KBO_SNAPSHOT 수신 시 경기 정보가 표시된다.
- GAME_EVENT 수신 시 선택 팀 경기 상태가 갱신된다.

### 5. 종료

```powershell
cd ./baseball-live-tracker

docker compose -f infra/docker-compose.yml down
```

---

## 환경 변수

| 실행 방식             | 환경변수 주입 방식                       | 실행 명령               |
| ----------------- | -------------------------------- | ------------------- |
| 로컬 개발 실행          | `node --env-file=.env`           | `pnpm dev`          |
| 로컬 빌드 실행          | `node --env-file=.env`           | `pnpm start`        |
| Docker Compose 실행 | `docker-compose.yml`의 `env_file` | `pnpm start:docker` |

### 환경변수 목록

| 변수명                         | 설명                      | 필수 여부 | 민감정보 여부 |
| --------------------------- | ----------------------- | ----- | ------- |
| `WEBSOCKET_PORT`            | WebSocket Server 실행 포트  | 필수    | 아님      |
| `KAFKA_CLIENT_ID`           | Kafka client 식별자        | 필수    | 아님      |
| `KAFKA_BROKERS`             | Kafka broker 접속 주소      | 필수    | 아님      |
| `KAFKA_GAME_EVENTS_TOPIC`   | 경기 이벤트 Topic 이름         | 필수    | 아님      |
| `KAFKA_CONSUMER_GROUP_ID`   | Kafka Consumer Group ID | 필수    | 아님      |
| `KBO_SCOREBOARD_URL`        | KBO 스코어보드 수집 URL        | 필수    | 아님      |
| `KBO_TEAM_RANK_URL`         | KBO 팀 순위 수집 URL         | 필수    | 아님      |
| `KBO_COLLECTOR_INTERVAL_MS` | Collector polling 간격    | 필수    | 아님      |

### 기준

* Docker Compose 실행 기준에서는 `KAFKA_BROKERS`를 Docker Compose 내부 Kafka service 기준으로 설정한다.
* 로컬에서 backend만 직접 실행하는 경우에는 `KAFKA_BROKERS`를 로컬 Kafka 접근 기준으로 조정한다.
* Docker 컨테이너에서는 `node --env-file=.env`를 사용하지 않는다.
* Docker 컨테이너는 `docker-compose.yml`의 `env_file`로 주입된 `process.env`를 사용한다.
* KBO URL은 TypeScript 코드에 기본값으로 두지 않는다.
* KBO Collector polling 간격은 `KBO_COLLECTOR_INTERVAL_MS`로 관리한다.
* `KBO_COLLECTOR_INTERVAL_MS`는 30000ms 이상으로 설정한다.
* `.env` 파일은 Git에 포함하지 않는다.
* `.env` 파일은 Docker 이미지에 포함하지 않는다.
* `.env`에는 비밀번호, API Key, 토큰, 쿠키, 세션 키 같은 민감정보를 저장하지 않는다.
* 민감정보가 필요한 시점에는 `.env`가 아니라 Docker secrets 또는 별도 Secret Manager 사용을 검토한다.


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
* [x] Phase 9. Popup UX / 팀 선택 유지 개선
* [x] Phase 10. Docker Compose 실행 정리
* [x] Phase 11. README / 시연 문서화

---

## 제외 범위

초기 MVP에서는 아래 항목을 구현하지 않는다.

* 외부 사이트 무단 크롤링
* 네이버 스포츠 수집
* KBO 게임센터 수집
* KBO 문자중계 수집
* 비공식 API 호출
* `/ws/` 하위 경로 직접 호출
* 로그인 기능
* 사용자 계정 관리
* Chrome Notification
* Background Service Worker
* chrome.storage 영구 저장
* 선수별 상세 기록 수집
* 홈런 / 투수 교체 / 타자 교체 판정
* 문자중계 기반 볼카운트 / 아웃카운트 / 주자 상황 수집
* 배포용 Chrome Web Store 등록
* 대규모 트래픽 처리
* Kubernetes 구성
* Prometheus / Grafana 모니터링
* 머신러닝 기반 경기 예측
