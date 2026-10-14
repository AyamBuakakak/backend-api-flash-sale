import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Product } from '../product/entities/product.entity.js';
import { Order } from './entities/order.entity.js';
import { OrderItem } from './entities/order-item.entity.js';

@Injectable()
export class FlashSaleService {
    constructor(private dataSource: DataSource) { }

    async buyProduct(productId: string, userId: string, quantityRequested: number = 1): Promise<Order> {
        const queryRunner = this.dataSource.createQueryRunner();

        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const product = await queryRunner.manager.findOne(Product, {
                where: { id: productId },
                lock: { mode: 'pessimistic_write' },
            });

            if (!product) {
                throw new BadRequestException('product not found');
            }

            if (product.stock < quantityRequested) {
                throw new BadRequestException('out of stock');
            }

            product.stock -= quantityRequested;
            await queryRunner.manager.save(product);

            const totalPrice = Number(product.price) * quantityRequested;


            const order = queryRunner.manager.create(Order, {
                userId,
                totalPrice: totalPrice,
                status: 'SUCCESS',
                items: [
                    queryRunner.manager.create(OrderItem, {
                        productId: product.id,
                        quantity: quantityRequested,
                        priceAtPurchase: product.price,
                    })
                ]
            });

            const savedOrder = await queryRunner.manager.save(order);

            await queryRunner.commitTransaction();

            return savedOrder;

        } catch (error) {
            console.error('SERVER CRASH:', error);
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }
}
