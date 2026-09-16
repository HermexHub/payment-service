import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as amqp from 'amqplib'
import {
	BaseEvent,
	InventoryRoutingKeys,
	RabbitExchanges,
	RabbitQueues
} from '@hermex/contracts'
import { TraceContext } from '@hermex/core'

export type EventHandler<T> = (event: BaseEvent<T>) => Promise<void>

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(RabbitMQService.name)
	private connection: amqp.ChannelModel | null = null
	private channel: amqp.Channel | null = null

	constructor(private readonly configService: ConfigService) {}

	async onModuleInit(): Promise<void> {
		await this.connect()
	}

	async onModuleDestroy(): Promise<void> {
		await this.close()
	}

	private async connect(): Promise<void> {
		const url = this.configService.get<string>('rabbitmq.url')!

		try {
			this.connection = await amqp.connect(url)
			this.channel = await this.connection.createChannel()

			this.logger.log('Connected to RabbitMQ successfully')

			await this.setupTopology()
		} catch (error) {
			this.logger.error(
				`Failed to connect to RabbitMQ: ${(error as Error).message}`
			)
		}
	}

	private async setupTopology(): Promise<void> {
		if (!this.channel) return

		// Assert Exchanges
		await this.channel.assertExchange(RabbitExchanges.ORDER, 'topic', {
			durable: true
		})
		await this.channel.assertExchange(RabbitExchanges.INVENTORY, 'topic', {
			durable: true
		})
		await this.channel.assertExchange(RabbitExchanges.PAYMENT, 'topic', {
			durable: true
		})
		await this.channel.assertExchange(RabbitExchanges.DLX, 'topic', {
			durable: true
		})
		await this.channel.assertQueue(RabbitQueues.DEAD_LETTER, {
			durable: true
		})
		await this.channel.bindQueue(
			RabbitQueues.DEAD_LETTER,
			RabbitExchanges.DLX,
			'#'
		)

		// Assert Queue: payment.inventory.events.queue (listens to inventory.reserved)
		await this.channel.assertQueue(RabbitQueues.PAYMENT_INVENTORY_EVENTS, {
			durable: true,
			deadLetterExchange: RabbitExchanges.DLX
		})
		await this.channel.bindQueue(
			RabbitQueues.PAYMENT_INVENTORY_EVENTS,
			RabbitExchanges.INVENTORY,
			InventoryRoutingKeys.RESERVED
		)

		this.logger.log('RabbitMQ topology verified for payment-service')
	}

	publishEvent<T>(
		exchange: string,
		routingKey: string,
		event: BaseEvent<T>
	): boolean {
		if (!this.channel) {
			this.logger.error('Cannot publish event: AMQP channel is not ready')
			return false
		}

		const content = Buffer.from(JSON.stringify(event))
		const success = this.channel.publish(exchange, routingKey, content, {
			persistent: true,
			headers: {
				'x-correlation-id': event.correlationId,
				'x-event-id': event.eventId
			}
		})

		this.logger.log(
			`[AMQP Pub] ${exchange} -> ${routingKey} (Correlation: ${event.correlationId})`
		)
		return success
	}

	async consumeEvents<T>(
		queueName: string,
		handler: EventHandler<T>
	): Promise<void> {
		if (!this.channel) {
			this.logger.error('Cannot start consumer: AMQP channel is not ready')
			return
		}

		await this.channel.consume(queueName, async (msg) => {
			if (!msg) return

			try {
				const event = JSON.parse(msg.content.toString()) as BaseEvent<T>
				const correlationId =
					event.correlationId ||
					(msg.properties.headers?.['x-correlation-id'] as string) ||
					'unknown'

				this.logger.log(
					`[AMQP Sub] Processing event from ${queueName} (Correlation: ${correlationId})`
				)

				await TraceContext.run(correlationId, async () => {
					await handler(event)
				})
				this.channel?.ack(msg)
			} catch (err) {
				this.logger.error(
					`Error processing message from ${queueName}: ${(err as Error).message}`
				)
				this.channel?.nack(msg, false, false)
			}
		})
	}

	private async close(): Promise<void> {
		try {
			await this.channel?.close()
			await this.connection?.close()
			this.logger.log('RabbitMQ connection closed')
		} catch (error) {
			this.logger.error(
				`Error closing RabbitMQ connection: ${(error as Error).message}`
			)
		}
	}
}
