# High-Concurrency Flash Sale API

> An optimized backend system designed to handle thousands of concurrent checkout requests with 100% data consistency. Built to solve the classic "Negative Stock" race condition during Flash Sale events.

## The Architecture & Core Solution
In a standard CRUD setup, 50 to 1,000 users attempting to buy an item with a limited stock at the exact same millisecond will result in data anomalies, typically leading to a negative stock balance (Race Condition).

To prevent this without introducing heavy message brokers like Kafka or RabbitMQ, this API implements:
*   **Pessimistic Locking (`SELECT ... FOR UPDATE`):** Enforced via TypeORM's `queryRunner` to queue concurrent requests at the database engine level (PostgreSQL).
*   **ACID Transactions:** Ensuring that the stock decrement and order creation are treated as a single atomic operation.

> Note: This main branch focuses on measuring the baseline latency and performance when users hit the API directly, without the aid of caching, rate limiters (throttler), or authentication.

## Benchmark & Stress Testing (K6)
This system was stress-tested using **Grafana K6** with the following parameters:
*   **Virtual Users (Concurrent):** 50, 100, 500, and 1000 VUs
*   **Initial Stock:** Randomly set between 7 to 118 items
*   **Test Duration:** 10 seconds per scenario

### Summary of Results:
*   [x] **Zero Data Anomalies:** The database recorded exactly 100% successful orders for modest traffic (50 - 100 VUs). The stock stopped exactly at 0. **No negative stock occurred.**
*   [x] **Graceful Rejection:** Excess requests were successfully rejected with a `400 Bad Request` (Out of Stock) response.
*   [x] **Breaking Point Analysis:** 
    * Up to **~250 VUs**, the server handled the queue flawlessly. 
    * At **500 VUs**, the Node.js server remained active, but the database began experiencing **connection pool exhaustion** (rejecting queries with 500 errors). 
    * At **1000 VUs**, the server became overloaded and rejected 70% of the traffic (Connection Refused).

### K6 Metric Results:

**50 VUs (Stable):**
```text
✗ success (Status 201)         ↳  20% — ✓ 10 / ✗ 40
✗ out of stock (Status 400)    ↳  80% — ✓ 40 / ✗ 10

http_req_duration: avg=385.68ms  p(95)=437.24ms
http_req_failed..: 80.00% 40 out of 50
```

**100 VUs (Stable):**
```text
✗ success (Status 201)         ↳  7% — ✓ 7 / ✗ 93
✗ out of stock (Status 400)    ↳  93% — ✓ 93 / ✗ 7

http_req_duration: avg=315.67ms  p(95)=382.79ms
http_req_failed..: 93.00% 93 out of 100
```

**500 VUs (unstable):**
```text
✗ success (Status 201)         ↳  3% — ✓ 15 / ✗ 485
✗ out of stock (Status 400)    ↳  51% — ✓ 259 / ✗ 241

http_req_duration: avg=324.24ms  p(95)=767.9ms 
http_req_failed..: 97.00% 485 out of 500
```

**1000 VUs (down):**
```text
✗ success (Status 201)         ↳  11% — ✓ 118 / ✗ 882
✗ out of stock (Status 400)    ↳  18% — ✓ 185 / ✗ 815

http_req_duration: avg=330.65ms  p(95)=1.34s
http_req_failed..: 88.20% 882 out of 1000
```

### Testing Result:
* **Unit Test:**
```text
✓ src/modules/module-catalog/order/flash-sale.service.spec.ts (5 tests)
   ✓ FlashSaleService (Vitest)
     ✓ must be defined
     ✓ buyProduct
       ✓ must successfully buy, commit transaction, and release connection
       ✓ throw BadRequestException and rollback if product was not found
       ✓ throw BadRequestException and rollback if out of stock
       ✓ rollback and release connection if internal error occurs in database

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  1.52s
```

* **e2e Test:**
    * **Failed Result:**
    ```text
    Status E2E: 400 {
    message: 'out of stock!',
    error: 'Bad Request',
    statusCode: 400
    }
    ✓ test/app.e2e-spec.ts (1 test)
    ```

    * **Success Result:**
    ```text
    Status E2E: 201 {
    id: '85f592f3-4d0b-4e50-9b50-80e08f1f3a1b',
    userId: '123e4567-e89b-12d3-a456-426614174000',
    totalPrice: 15000000,
    status: 'SUCCESS',
    items: [ ... ],
    createdAt: '2026-10-05T04:22:19.368Z'
    }
    ✓ test/app.e2e-spec.ts (1 test)
    ```

## Database Schema
<img width="385" height="395" alt="Screenshot 2026-10-07 052443" src="https://github.com/user-attachments/assets/068f430d-efb8-4eef-bea4-e77c73dc0198" />

## Core System Architecture
<img width="6178" height="3121" alt="flow system" src="https://github.com/user-attachments/assets/878f04a8-66a8-405c-addf-f97f86659b8c" />


## Tech Stack
* Framework: NestJS (Node.js)
* Database: PostgreSQL
* ORM: TypeORM
* Testing: K6 (Load Testing), Vitest & Supertest (Unit & E2E Testing)

## Project Iterations & Branches
This project was developed in stages to simulate real-world problem solving. You can explore the evolution of the system by switching branches:

*   **[`main`](https://github.com/AyamBuakakak/backend-api-flash-sale/tree/main)** : The core REST API functionality and database schema for the flash sale system.
*   **[`throttler`](https://github.com/AyamBuakakak/backend-api-flash-sale/tree/throttler)** : Introduction of basic Rate Limiting to prevent server overload and spam requests.
*   **[`throttler-redis`](https://github.com/AyamBuakakak/backend-api-flash-sale/tree/throttler-redis)** : Upgraded the throttling mechanism by integrating **Redis** and **Docker** for high-performance, real-time distributed caching.

## How to Run Locally
* Clone this repository: `git clone <your-repo-url>`
* Start the database using Docker: `docker-compose up -d`
* Install dependencies: `npm install`
* Run migrations: `npm run typeorm migration:run`
* Start the server: `npm run start:dev`

## Future Improvements
*   [ ] Implement Rate-Limiting (Throttler) to handle DDoS anomalies and drop excessive requests gracefully.
*   [ ] Implement Redis Caching for product catalogs to drastically reduce read operations on PostgreSQL.
*   [ ] Build a custom Authentication System using JWT and HttpOnly Cookies on the frontend.
*   [ ] Add comprehensive e-commerce features (Order History, Order Cancellation, Product Management, etc.).
*   [ ] Separate the read and write database operations (CQRS Pattern) for horizontal scaling.
