<div align="center">

# 💰 Hermex Payment Service
### Фінансовий процесинг, ідемпотентність та розрахунки у Saga

[ [English](README.md) ] &nbsp;•&nbsp; [ **Українська** ] &nbsp;•&nbsp; [ [Головний огляд](../overview/README.ua.md) ]

<p align="center">
  Транспорт gRPC (:50052) &bull; PostgreSQL (payments_db) &bull; Двигун ідемпотентності &bull; Стандарт PCI-DSS
</p>

</div>

> **Payment Service** — мікросервіс процесингу платежів, симуляції банківських сценаріїв та забезпечення ідемпотентності транзакцій Hermex.  
> Працює за протоколом gRPC, зберігає записи в ізольованій базі `payments_db`, гарантує виключно одноразове списання за `Idempotency-Key` та відправляє події Saga (`payment.succeeded` або `payment.failed`) у RabbitMQ.

---

## 🏛️ Процесинг платежів у Saga

```mermaid
flowchart LR
    GW["API Gateway"] -->|"gRPC ProcessPayment()"| PS["💰 Payment Service"]
    PS -->|"Перевірка Idempotency"| DB[("🐘 payments_db")]
    
    alt Успішно авторизовано (SUCCESS)
        PS -->|"Save status: SUCCEEDED"| DB
        PS -->|"Publish payment.succeeded"| RMQ{{"🐇 RabbitMQ (payment.topic)"}}
    else Відхилено (FAILED / REJECTED)
        PS -->|"Save status: FAILED"| DB
        PS -->|"Publish payment.failed"| RMQ
    end
```

---

## 🧪 Симуляція банківських сценаріїв (Payment Scenarios)

Для наскрізного тестування розподіленої Saga реалізовано симулятор:

| Сценарій (`PaymentScenario`) | Тестова картка | Результат | Подія в RabbitMQ |
| :--- | :---: | :---: | :--- |
| `SUCCESS` | `4242...4242` | ✅ Списано успішно | `payment.succeeded` |
| `INSUFFICIENT_FUNDS` | `4000...0002` | ❌ Недостатньо коштів | `payment.failed` (`INSUFFICIENT_FUNDS`) |
| `CARD_EXPIRED` | `4000...0003` | 🚫 Картка прострочена | `payment.failed` (`CARD_EXPIRED`) |
| `BANK_DECLINED` | `4000...0004` | 🛑 Відхилено банком | `payment.failed` (`BANK_DECLINED`) |
| `TIMEOUT` | `4000...0005` | ⏱️ Таймаут шлюзу | `payment.failed` (`ISSUER_TIMEOUT`) |

---

## 📜 gRPC Контракт (`payment.proto`)

```protobuf
syntax = "proto3";

package hermex.payment;

service PaymentGrpcService {
  rpc CreatePaymentSession (CreatePaymentSessionRequest) returns (CreatePaymentSessionResponse);
  rpc ProcessPayment (ProcessPaymentRequest) returns (ProcessPaymentResponse);
}
```

### RPC-методи:
1. **`CreatePaymentSession`:** Створює сесію оплати для замовлення з фіксацією суми в гривнях та TTL 15 хвилин.
2. **`ProcessPayment`:** Проводить платіж. Перевіряє унікальність `idempotencyKey`, емулює роботу банку-емітента та публікує події.

---

## 🛡️ Безпека та відповідність PCI-DSS

1. **Zero Raw Card Storage:** Повні номери карток та CVV-коди **ніколи не записуються в базу даних** та не зберігаються на диску.
2. **Маскування логів:** `HermexLogger` маскує номер картки у формат `4242 **** **** 4242`.
3. **Гарантія ідемпотентності:** Унікальний індекс за полем `idempotency_key` унеможливлює подвійне списання коштів.

---

## 🐘 Модель даних (`payments_db`)

- **Таблиця `payments` (`PaymentEntity`):**
  - `id`: UUID (Primary Key)
  - `orderId`: UUID (Зв'язок із замовленням)
  - `amount`: Decimal (Сума транзакції в грн)
  - `currency`: String (`UAH`)
  - `status`: Enum (`PENDING`, `SUCCEEDED`, `FAILED`)
  - `idempotencyKey`: String (Унікальний ключ)
  - `scenario`: Enum (`SUCCESS`, `INSUFFICIENT_FUNDS`, ...)
  - `failureReason`: String (Nullable)
  - `createdAt`, `updatedAt`: Timestamps

---

## 📊 Спостережуваність та метрики Prometheus

Мікросервіс працює як **NestJS Hybrid Application**:
- gRPC порт: `:50052`
- Порт метрик: `:3003/metrics`
- Метрики:
  - `hermex_payments_total` (загальна кількість спроб оплати)
  - `hermex_payment_duration_seconds` (гістограма часу авторизації)
  - `hermex_payment_failures_total` (лічильник відхилень за причинами)

---

## ⚙️ Змінні оточення (`.env`)

| Змінна | Тип | За замовчуванням | Опис |
| :--- | :---: | :---: | :--- |
| `GRPC_PORT` | number | `50052` | Порт gRPC-сервера |
| `METRICS_PORT` | number | `3003` | Порт метрик Prometheus |
| `DB_HOST` | string | `localhost` | Хост PostgreSQL |
| `DB_PORT` | number | `5432` | Порт PostgreSQL |
| `DB_USERNAME` | string | `hermex` | Користувач бази даних |
| `DB_PASSWORD` | string | `hermex_secret_pwd`| Пароль бази даних |
| `DB_DATABASE` | string | `payments_db` | База даних платежів |
| `RABBITMQ_URL` | string | `amqp://...` | Рядок підключення до RabbitMQ |

---

## 🛠️ Запуск мікросервісу

```bash
# Встановлення залежностей
bun install

# Запуск у режимі розробки
bun run start:dev

# Запуск у Docker Compose
docker compose up -d --build
```
