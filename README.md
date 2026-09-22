<div align="center">

# 💰 Hermex Payment Service
### Financial Processing, Idempotency & Saga Settlement

[ **English** ] &nbsp;•&nbsp; [ [Українська](README.ua.md) ] &nbsp;•&nbsp; [ [System Overview](../overview/README.md) ]

<p align="center">
  gRPC Transport (:50052) &bull; PostgreSQL (payments_db) &bull; Idempotency Engine &bull; PCI-DSS Ready
</p>

</div>

> **Payment Service** is the payment processing, scenario simulation, and transaction idempotency engine for Hermex.  
> It communicates via gRPC, isolates financial records in `payments_db`, guarantees strictly once payment execution via `Idempotency-Key`, and emits terminal Saga events (`payment.succeeded` or `payment.failed`) to RabbitMQ.

---

## 🏛️ Saga Processing Flow

```mermaid
flowchart LR
    GW["API Gateway"] -->|"gRPC ProcessPayment()"| PS["💰 Payment Service"]
    PS -->|"Idempotency Check"| DB[("🐘 payments_db")]
    
    alt Authorized (SUCCESS)
        PS -->|"Save status: SUCCEEDED"| DB
        PS -->|"Publish payment.succeeded"| RMQ{{"🐇 RabbitMQ (payment.topic)"}}
    else Declined (FAILED / REJECTED)
        PS -->|"Save status: FAILED"| DB
        PS -->|"Publish payment.failed"| RMQ
    end
```

---

## 🧪 Simulation Engine (Payment Scenarios)

The service provides an integrated scenario simulation engine for distributed transaction testing:

| Scenario (`PaymentScenario`) | Test Card | Outcome | Emitted AMQP Event |
| :--- | :---: | :---: | :--- |
| `SUCCESS` | `4242...4242` | ✅ Authorized | `payment.succeeded` |
| `INSUFFICIENT_FUNDS` | `4000...0002` | ❌ Insufficient Funds | `payment.failed` (`INSUFFICIENT_FUNDS`) |
| `CARD_EXPIRED` | `4000...0003` | 🚫 Expired Card | `payment.failed` (`CARD_EXPIRED`) |
| `BANK_DECLINED` | `4000...0004` | 🛑 Issuer Declined | `payment.failed` (`BANK_DECLINED`) |
| `TIMEOUT` | `4000...0005` | ⏱️ Gateway Timeout | `payment.failed` (`ISSUER_TIMEOUT`) |

---

## 📜 gRPC Interface (`payment.proto`)

```protobuf
syntax = "proto3";

package hermex.payment;

service PaymentGrpcService {
  rpc CreatePaymentSession (CreatePaymentSessionRequest) returns (CreatePaymentSessionResponse);
  rpc ProcessPayment (ProcessPaymentRequest) returns (ProcessPaymentResponse);
}
```

### RPC Methods:
1. **`CreatePaymentSession`:** Initializes an isolated checkout session for a given order, defining sum in UAH and setting a 15-minute TTL.
2. **`ProcessPayment`:** Captures payment. Validates `idempotencyKey` uniqueness, simulates issuer processing, and publishes downstream events.

---

## 🛡️ PCI-DSS Standards & Security

1. **Zero Raw Card Storage:** Full PANs and CVV codes are **never persisted to disk or databases**.
2. **Telemetry Sanitization:** `HermexLogger` redacts card numbers to masked format (`4242 **** **** 4242`).
3. **Idempotency Guarantee:** Unique database constraints on `idempotency_key` prevent double charges on network retries.

---

## 🐘 Data Model (`payments_db`)

- **Table `payments` (`PaymentEntity`):**
  - `id`: UUID (Primary Key)
  - `orderId`: UUID (Order relation)
  - `amount`: Decimal (Transaction sum in UAH)
  - `currency`: String (`UAH`)
  - `status`: Enum (`PENDING`, `SUCCEEDED`, `FAILED`)
  - `idempotencyKey`: String (Unique constraint)
  - `scenario`: Enum (`SUCCESS`, `INSUFFICIENT_FUNDS`, ...)
  - `failureReason`: String (Nullable)
  - `createdAt`, `updatedAt`: Timestamps

---

## 📊 Telemetry & Prometheus Metrics

Initialized as a **NestJS Hybrid Application**:
- gRPC port: `:50052`
- Metrics port: `:3003/metrics`
- Metrics:
  - `hermex_payments_total` (total count of payment attempts)
  - `hermex_payment_duration_seconds` (histogram of processing latency)
  - `hermex_payment_failures_total` (counter of declines partitioned by reason)

---

## ⚙️ Environment Variables (`.env`)

| Variable | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `GRPC_PORT` | number | `50052` | gRPC listening port |
| `METRICS_PORT` | number | `3003` | Prometheus metrics port |
| `DB_HOST` | string | `localhost` | PostgreSQL host |
| `DB_PORT` | number | `5432` | PostgreSQL port |
| `DB_USERNAME` | string | `hermex` | Database user |
| `DB_PASSWORD` | string | `hermex_secret_pwd`| Database password |
| `DB_DATABASE` | string | `payments_db` | Payment database name |
| `RABBITMQ_URL` | string | `amqp://...` | AMQP broker connection URL |

---

## 🛠️ Run & Deployment

```bash
# Install dependencies
bun install

# Start development mode
bun run start:dev

# Launch containerized service
docker compose up -d --build
```
