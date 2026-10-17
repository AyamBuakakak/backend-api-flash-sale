import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable, of, tap } from "rxjs";
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class TransformAndCacheInterceptor implements NestInterceptor {
    constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) { }

    private generateCleanCacheKey(request: any): string {
        const path = request.path;
        const query = { ...request.query };
        const ignoredParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
        ignoredParams.forEach(param => delete query[param]);
        const sortedKeys = Object.keys(query).sort();
        const sortedQuery: Record<string, any> = {};

        sortedKeys.forEach(key => {
            sortedQuery[key] = query[key];
        });

        const cleanQueryString = new URLSearchParams(sortedQuery).toString();

        return cleanQueryString ? `${path}?${cleanQueryString}` : path;
    }

    async intercept(context: ExecutionContext, next: CallHandler<any>): Promise<Observable<any>> {
        const httpContext = context.switchToHttp();
        const request = httpContext.getRequest();
        const response = httpContext.getResponse();

        const isGetRequest = request.method === 'GET';
        const cacheKey = this.generateCleanCacheKey(request);

        if (request.path.includes('/me') || request.path.includes('/private')) {
            return next.handle().pipe(
                map((data) => {
                    const customMessage = data?.message || 'Success';
                    const actualData = data?.data !== undefined ? data.data : data;

                    return {
                        statusCode: response.statusCode,
                        message: customMessage,
                        data: actualData,
                        timestamp: new Date().toISOString(),
                    };
                })
            );
        }

        if (isGetRequest) {
            const cachedData = await this.cacheManager.get(cacheKey);
            if (cachedData) {
                console.log(`[Cache Hit] Data return from Redis for key: ${cacheKey}`);
                return of(cachedData);
            }
            console.log(`[Cache Miss] Data was not found Redis.`);
        }

        return next.handle().pipe(
            map((data) => {
                const customMessage = data?.message || 'Success';
                const actualData = data?.data !== undefined ? data.data : data;

                return {
                    statusCode: response.statusCode,
                    message: customMessage,
                    data: actualData,
                    timestamp: new Date().toISOString(),
                };
            }),

            tap((formattedResponse) => {
                if (isGetRequest && formattedResponse) {
                    const ttlMilliSeconds = 60000;

                    this.cacheManager.set(cacheKey, formattedResponse, ttlMilliSeconds)
                        .then(() => console.log(`[Cache Set] Berhasil menyimpan data ke Redis untuk key: ${cacheKey}`))
                        .catch((err) => console.error(`[Cache Error] Gagal menyimpan ke Redis untuk key: ${cacheKey}`, err));
                }
            })
        );
    }
}