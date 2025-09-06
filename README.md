# 📡 Notification Service

A distributed notification processing system with:

- **API** (Hono + Bun) to enqueue notifications.
- **Redis queue** for dispatching jobs.
- **Worker threads** for concurrent processing.
- **Postgres** for durable persistence.
- **Prometheus + Grafana + Loki** for observability (metrics + logs).
- **Reaper & Reconciler** background jobs for fault recovery.

---

## 🚀 Quickstart

### 1. Install dependencies

```sh
bun install
```

### 2. Run the service

```sh
bun run dev
```

API available at:
👉 [http://localhost:3000](http://localhost:3000)

### 3. Run infrastructure (Redis, Postgres, Prometheus, Grafana, Loki)

```sh
docker-compose up -d
```

- Postgres → `localhost:5432`
- Redis → `localhost:6379`
- Prometheus → [http://localhost:9090](http://localhost:9090)
- Grafana → [http://localhost:3001](http://localhost:3001)
- Loki → [http://localhost:3100](http://localhost:3100)

Grafana credentials (default): `admin / admin`

---

## 📊 Architecture

### System Flow

```mermaid
flowchart TD
    subgraph API["API (Hono, Bun)"]
        A[POST /notify] -->|Insert| DB[(Postgres)]
        A -->|Enqueue| R[(Redis Queue)]
    end

    subgraph Workers["Worker Threads"]
        R --> W1[Worker 1]
        R --> W2[Worker 2]
        R --> Wn[Worker N]
        W1 -->|Update status| DB
        W2 -->|Update status| DB
        Wn -->|Update status| DB
    end

    subgraph Jobs["Background Jobs"]
        J1[Reaper] --> DB
        J1 --> R
        J2[Reconciler] --> DB
        J2 --> R
    end

    subgraph Observability["Observability"]
        API --> M1[Prometheus Metrics /metrics]
        Workers --> M1
        M1 --> G[Grafana Dashboards]

        API --> L[Loki Logs via pino-loki]
        Workers --> L
        L --> G
    end
```

---

### Worker Lifecycle

```mermaid
sequenceDiagram
    participant API
    participant DB
    participant Redis
    participant Worker
    API->>DB: Insert notification (QUEUED)
    API->>Redis: Push job ID
    Worker->>Redis: Pop job ID
    Worker->>DB: Set status=SENDING
    Worker->>DB: On success → status=SENT
    Worker->>DB: On failure → retries++ and requeue
```

---

## 📈 Metrics

Available at [`/metrics`](http://localhost:3000/metrics):

- **API**
  - `api_jobs_enqueued_total`
  - `api_jobs_enqueue_failed_total`

- **Workers**
  - `worker_jobs_picked_up_total`
  - `worker_jobs_sent_total`
  - `worker_jobs_failed_total`
  - `worker_jobs_retried_total`

- **Background jobs**
  - `reaper_runs_total`, `reconciler_runs_total`
  - `db_queued_notifications`, `db_sending_notifications`

---

## 📜 Logs

Logs are handled via [pino](https://github.com/pinojs/pino) with dual transports:

- Pretty console output (for dev).
- JSON structured logs → [Loki](https://grafana.com/oss/loki/) (for Grafana dashboards).

---

## 🧪 Stress Testing

Run load test with [Artillery](https://artillery.io/):

```sh
bun run stressTest
```

Config: [`stress-test.yml`](./stress-test.yml)
👉 Spawns 20 RPS for 60s.

---

## ⚙️ Configuration

All config is defined in [`.env`](.env.example):

```env
DATABASE_URL=postgresql://notification_user:notification_password@localhost:5432/notification_db
REDIS_URL=localhost:6379
NUM_THREADS=2
MAX_RETRIES=3
REAPING_INTERVAL_MINS=1
RECONCILIATION_INTERVAL_MINS=1
```
