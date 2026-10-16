# High-Concurrency Flash Sale API

> An optimized backend system designed to handle thousands of concurrent checkout requests with 100% data consistency. Built to solve the classic "Negative Stock" race condition during Flash Sale events.

## The Architecture & Core Solution
In a standard CRUD setup, 50 to 1,000 users attempting to buy an item with a limited stock at the exact same millisecond will result in data anomalies, typically leading to a negative stock balance (Race Condition).

To prevent this without introducing heavy message brokers like Kafka or RabbitMQ, this API implements:
*   **Pessimistic Locking (`SELECT ... FOR UPDATE`):** Enforced via TypeORM's `queryRunner` to queue concurrent requests at the database engine level (PostgreSQL).
*   **ACID Transactions:** Ensuring that the stock decrement and order creation are treated as a single atomic operation.

> Note: This Throttler-Redis branch focus on optimizing data fetching with Redis when users hit the API, with rate limiters (throttler) by nest.js + reddis caching storage without authentication.

## Throttler Configuration
Configure the redis with docker server for available request to hits api with caching data, create a docker-compose file containing the configuration code, and run with docker CLI.

### Docker Compose Configuration:
```yaml
services:
  redis-dev:
    image: redis:7-alpine
    container_name: redis_dev_server
    ports:
      - "6379:6379"
  redis-commander:
    image: rediscommander/redis-commander:latest
    container_name: redis_dev_ui
    environment:
      - REDIS_HOSTS=local:redis-dev:6379
    ports:
      - "8081:8081"
    depends_on:
      - redis-dev
```

### Docker Command:
```
docker-compose -f docker-compose.dev.yml up -d
```

## Benchmark & Stress Testing (K6)
This system was stress-tested using **Grafana K6** with the following parameters:
*   **Virtual Users (Concurrent):** 20 VUs with distinct IP injection (X-Forwarded-For).
*   **Test Duration:** 30 seconds with a 1-second staggered delay.

### Summary of Results:
*   [x] **Performance Optimization:** Implemented a robust Redis caching layer using custom NestJS Interceptors for read-heavy operations (GET endpoints). Successfully reduced response latency from ~68ms (Database Query) to < 2ms (Memory Cache Hit), achieving a ~97% performance improvement validated via k6 load testing.
*   [x] **Throttler Resilience:** 100% of legitimate staggered requests were successfully processed (Status 200) without triggering the rate-limiter block.

### K6 Metric Results:
* **20 VUs with the different IP (Stable):**
```text
✓ Berhasil Muat Produk (200)

HTTP
http_req_duration..............: avg=4.89ms min=569.2µs med=1.6ms max=68.25ms p(90)=2.24ms p(95)=5.55ms
    { expected_response:true }...: avg=4.89ms min=569.2µs med=1.6ms max=68.25ms p(90)=2.24ms p(95)=5.55ms
http_req_failed................: 0.00%  0 out of 20
http_reqs......................: 20     0.999798/s
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
<img width="466" height="531" alt="ERD PostgreSQL" src="https://github.com/user-attachments/assets/353f84db-ca2f-498b-8e20-b95060e5e97c" />

## Core System Architecture
<img width="7238" height="4604" alt="flow system throttler-redis" src="https://github.com/user-attachments/assets/ddad32c6-7304-40e8-9578-ef377372b156" />

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
*   [x] Implement Redis Caching for product catalogs to drastically reduce read operations on PostgreSQL.
*   [ ] Build a custom Authentication System using JWT and HttpOnly Cookies on the frontend.
*   [ ] Add comprehensive e-commerce features (Order History, Order Cancellation, Product Management, etc.).
*   [ ] Separate the read and write database operations (CQRS Pattern) for horizontal scaling.
