# High-Concurrency Flash Sale API

> An optimized backend system designed to handle thousands of concurrent checkout requests with 100% data consistency. Built to solve the classic "Negative Stock" race condition during Flash Sale events.

## The Architecture & Core Solution
In a standard CRUD setup, 50 to 1,000 users attempting to buy an item with a limited stock at the exact same millisecond will result in data anomalies, typically leading to a negative stock balance (Race Condition).

To prevent this without introducing heavy message brokers like Kafka or RabbitMQ, this API implements:
*   **Pessimistic Locking (`SELECT ... FOR UPDATE`):** Enforced via TypeORM's `queryRunner` to queue concurrent requests at the database engine level (PostgreSQL).
*   **ACID Transactions:** Ensuring that the stock decrement and order creation are treated as a single atomic operation.

> Note: This Throttler branch focuses on measuring the baseline latency and performance when users hit the API, with rate limiters (throttler) by nest.js without reddis caching storage, or authentication.

## Throttler Configuration
Configure the Nest Throttler with two layers for a seconds and a minute for available request to hits, with the minimum up to 5 request per seconds and maximum 200 per minute to prevent the DDos attacks, without reddis caching storage and authentication system.

### Configuration Code:
* **Throttler Module:**
```text
import { ThrottlerModule } from "@nestjs/throttler";

export const throttlerModule = ThrottlerModule.forRoot([{
    name: 'short',
    ttl: 1000,
    limit: 5,
}, {
    name: 'long',
    ttl: 60000,
    limit: 200,
}
]);
```

* **Throttler Guard:**
```text
import { Provider } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard } from "@nestjs/throttler";

export const throttlerGuard: Provider<ThrottlerGuard> = {
    provide: APP_GUARD,
    useClass: ThrottlerGuard,
}
```


## Benchmark & Stress Testing (K6)
This system was stress-tested using **Grafana K6** with the following parameters:
*   **Virtual Users (Concurrent):** 220, and as much is possible in 15 secconds by 100 with different IP (~49.000) VUs.
*   **Test Duration:** 10, 15, and 120 seconds for different scenario.

### Summary of Results:
*   [x] **Zero Data Anomalies:** The database recorded exactly 100% successful orders handled by throttler for modest traffic (~220 VUs) and massive traffic (7.500 VUs) per seconds. The stock stopped exactly at 0. **No negative stock occurred.**
*   [x] **Graceful Rejection:** Excess requests were successfully rejected with a `429 Too Many Request` by throttler and `400 Bad Request` (Out of Stock) response.
*   [x] **Breaking Point Analysis:** 
    * At **~220 VUs**, the server handled the queue flawlessly, with **Throttler** configuration in short and long layer is really working in this scenario: 
        * **Short Layer:** When requests with the same IP wants to hit API at exact same seconds, short layer let 5 request by limit configuration to be processed and the rest of request has rejected by **Throttler** (rejecting request with 429 errors).
        
        * **Long Layer:** When 220 requests with the same IP wants to hit API with 300 miliseconds pause (~3 request per seconds) in total 120 seconds, short layer passed the request and the request never reach the limit of the long layer (rejecting request with 400 errors).
    
    * At the massive VUs with **~49.000** in 15 seconds, the server successfully resisted when get hit by **7.500 VUs** per seconds by 100 VUs with different IP, the database safely processing few request (75 VUs) the stock stopped exactly at 0, and the rest of request get rejecting by **Throttler**. The reason why the rest of limit on long layer (125) get rejected, because in the first seconds when 7.500 VUs hits the short layer just let in the first 5 request per IP following the system of **throttler** so in total of 100 VUs times 5 limit in short layer is become 75 and long layer is never running because the short layer is rejeceting the rest of VUs.

### K6 Metric Results:
* **220 VUs with the same IP (Stable):**
    * **Short Layer:**
    ```text
    ✗ Allowed (201/400)
        ↳  2% — ✓ 5 / ✗ 215
        ✗ Blocked Exactly (429)
        ↳  97% — ✓ 215 / ✗ 5

        HTTP
        http_req_duration..............: avg=3.2ms   min=0s      med=654.5µs  max=507.07ms p(90)=1.1ms    p(95)=1.25ms  
        { expected_response:true }...: avg=110.5ms min=10.17ms med=12.04ms  max=507.07ms p(90)=309.44ms p(95)=408.26ms
        http_req_failed................: 97.72% 215 out of 220
        http_reqs......................: 220    303.216535/s
    ```
        
    * **Long Layer:**
    ```text
    ✓ Allowed (201/400)
    ✗ Blocked Exactly (429) 
    ↳ 0% — ✓ 0 / ✗ 220

        HTTP 
        http_req_duration..............: avg=5.79ms min=2.9ms med=4.57ms max=81.88ms p(90)=7.12ms p(95)=14.39ms
        { expected_response:true }...: avg=19.1ms min=13.35ms med=14.39ms max=81.88ms p(90)=16.74ms p(95)=36.45ms
        http_req_failed................: 93.18% 205 out of 220
        http_reqs......................: 220 3.253161/s
    ```

* **~49.000 VUs (Stable):**
```text
✓ Server Resistance (Not 5xx)
    ✗ Success Orders (201)
      ↳  0% — ✓ 18 / ✗ 49656
    ✗ Out of Stock (400)
      ↳  0% — ✓ 57 / ✗ 49617
    ✗ Blocked by Throttler (429)
      ↳  99% — ✓ 49599 / ✗ 75

    HTTP
    http_req_duration..............: avg=30.06ms  min=573.79µs med=28.37ms  max=1.52s p(90)=33.41ms p(95)=36.24ms
      { expected_response:true }...: avg=917.09ms min=311.18ms med=922.67ms max=1.52s p(90)=1.35s   p(95)=1.38s  
    http_req_failed................: 99.96% 49656 out of 49674
    http_reqs......................: 49674  3305.76935/s
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
<img width="466" height="531" alt="ERD PostgreSQL" src="https://github.com/user-attachments/assets/7b34fa76-61a1-403d-bb00-23ae623f3d20" />

## Core System Architecture
<img width="6178" height="3121" alt="flow system throttler" src="https://github.com/user-attachments/assets/0cbf77bf-3bcc-4951-8607-7ac82004fbe4" />


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
*   [x] Implement Rate-Limiting (Throttler) to handle DDoS anomalies and drop excessive requests gracefully.
*   [ ] Implement Redis Caching for product catalogs to drastically reduce read operations on PostgreSQL.
*   [ ] Build a custom Authentication System using JWT and HttpOnly Cookies on the frontend.
*   [ ] Add comprehensive e-commerce features (Order History, Order Cancellation, Product Management, etc.).
*   [ ] Separate the read and write database operations (CQRS Pattern) for horizontal scaling.
