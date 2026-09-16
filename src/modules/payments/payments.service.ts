import {
	Injectable,
	Logger,
	NotFoundException,
	OnApplicationBootstrap
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { v4 as uuidv4 } from 'uuid'
import {
	BaseEvent,
	ConfirmPaymentRequest,
	ConfirmPaymentResponse,
	GetPaymentSessionResponse,
	InventoryReservedPayload,
	PaymentFailedPayload,
	PaymentRoutingKeys,
	PaymentStatus,
	PaymentSucceededPayload,
	RabbitExchanges,
	RabbitQueues
} from '@hermex/contracts'
import { RabbitMQService } from '../rabbitmq/rabbitmq.service'
import { PaymentTransactionEntity } from './entities/payment-transaction.entity'
import { MetricsService } from '../metrics/metrics.service'
import { ProcessedEventEntity } from './entities/processed-event.entity'
import { SimulationEngine } from './simulation/simulation.engine'

@Injectable()
export class PaymentsService implements OnApplicationBootstrap {
	private readonly logger = new Logger(PaymentsService.name)

	constructor(
		private readonly dataSource: DataSource,
		@InjectRepository(PaymentTransactionEntity)
		private readonly paymentRepository: Repository<PaymentTransactionEntity>,
		@InjectRepository(ProcessedEventEntity)
		private readonly processedEventRepository: Repository<ProcessedEventEntity>,
		private readonly rabbitMQService: RabbitMQService,
		private readonly simulationEngine: SimulationEngine,
		private readonly metricsService: MetricsService
	) {}

	async onApplicationBootstrap(): Promise<void> {
		await this.listenToSagaEvents()
	}

	/**
	 * Saga Consumer: Handle inventory.reserved
	 * Creates a pending payment session awaiting checkout confirmation by customer
	 */
	async handleInventoryReserved(
		event: BaseEvent<InventoryReservedPayload>
	): Promise<void> {
		const { eventId, correlationId, payload } = event
		const { orderId, userId, totalAmount, currency } = payload

		this.logger.log(
			`[${correlationId}] Processing inventory.reserved for Order: ${orderId} (Total: ${totalAmount} ${currency})`
		)

		// 1. Idempotency check on incoming event
		const alreadyProcessed = await this.processedEventRepository.findOne({
			where: { eventId }
		})
		if (alreadyProcessed) {
			this.logger.warn(
				`[${correlationId}] Event ${eventId} for Order ${orderId} has already been processed. Skipping duplicate.`
			)
			return
		}

		// 2. Find or create pending payment transaction
		let transaction = await this.paymentRepository.findOne({
			where: { orderId }
		})

		if (!transaction) {
			transaction = this.paymentRepository.create({
				orderId,
				userId,
				amount: totalAmount,
				currency: currency || 'USD',
				status: PaymentStatus.PENDING
			})
			await this.paymentRepository.save(transaction)
		}

		// 3. Mark event as processed
		await this.recordProcessedEvent(eventId, 'inventory.reserved')

		this.logger.log(
			`[${correlationId}] Payment session ${transaction.id} ready in PENDING state for Order: ${orderId}`
		)
	}

	/**
	 * gRPC Query: Get payment session details for Hosted Checkout UI
	 */
	async getPaymentSession(
		orderId: string
	): Promise<GetPaymentSessionResponse> {
		const transaction = await this.paymentRepository.findOne({
			where: { orderId }
		})

		if (!transaction) {
			throw new NotFoundException(
				`Payment session not found for Order ID: ${orderId}`
			)
		}

		return {
			paymentId: transaction.id,
			orderId: transaction.orderId,
			userId: transaction.userId,
			amount: Number(transaction.amount),
			currency: transaction.currency,
			status: transaction.status,
			failureReason: transaction.failureReason,
			createdAt: transaction.createdAt.toISOString(),
			updatedAt: transaction.updatedAt?.toISOString()
		}
	}

	/**
	 * gRPC Mutation: Confirm payment from Hosted Checkout UI with test card & simulation scenario
	 */
	async confirmPayment(
		data: ConfirmPaymentRequest,
		correlationId = uuidv4()
	): Promise<ConfirmPaymentResponse> {
		const {
			orderId,
			cardNumber,
			scenario,
			idempotencyKey
		} = data

		const startTime = Date.now()

		this.logger.log(
			`[${correlationId}] Confirming payment for Order: ${orderId} (Scenario: ${scenario || 'AUTO'})`
		)

		// 1. Check idempotency if key provided
		if (idempotencyKey) {
			const existing = await this.paymentRepository.findOne({
				where: { idempotencyKey }
			})
			if (existing && existing.status !== PaymentStatus.PENDING) {
				this.logger.warn(
					`[${correlationId}] Idempotent replay for key ${idempotencyKey}. Returning existing status: ${existing.status}`
				)
				return {
					paymentId: existing.id,
					orderId: existing.orderId,
					status: existing.status,
					amount: Number(existing.amount),
					currency: existing.currency,
					failureReason: existing.failureReason,
					processedAt: existing.updatedAt.toISOString()
				}
			}
		}

		// 2. Fetch payment transaction
		const transaction = await this.paymentRepository.findOne({
			where: { orderId }
		})

		if (!transaction) {
			throw new NotFoundException(
				`Payment transaction not found for Order: ${orderId}`
			)
		}

		// If already finalized, return current status
		if (transaction.status === PaymentStatus.SUCCEEDED) {
			return {
				paymentId: transaction.id,
				orderId: transaction.orderId,
				status: transaction.status,
				amount: Number(transaction.amount),
				currency: transaction.currency,
				processedAt: transaction.updatedAt.toISOString()
			}
		}

		// 3. Run Simulation Engine
		const simResult = await this.simulationEngine.processSimulation(
			cardNumber,
			scenario
		)

		transaction.idempotencyKey = idempotencyKey || uuidv4()
		transaction.scenario = simResult.scenario

		if (simResult.success) {
			// Success Path
			transaction.status = PaymentStatus.SUCCEEDED
			transaction.failureReason = undefined
			await this.paymentRepository.save(transaction)

			const durationSeconds = (Date.now() - startTime) / 1000
			this.metricsService.recordPaymentSuccess(
				transaction.currency,
				durationSeconds
			)

			this.logger.log(
				`[${correlationId}] Payment ${transaction.id} SUCCEEDED for Order ${orderId}`
			)

			// Publish payment.succeeded event to RabbitMQ
			const event: BaseEvent<PaymentSucceededPayload> = {
				eventId: uuidv4(),
				correlationId,
				timestamp: new Date().toISOString(),
				payload: {
					paymentId: transaction.id,
					orderId: transaction.orderId,
					userId: transaction.userId,
					amount: Number(transaction.amount),
					currency: transaction.currency,
					idempotencyKey: transaction.idempotencyKey,
					processedAt: new Date().toISOString()
				}
			}

			this.rabbitMQService.publishEvent(
				RabbitExchanges.PAYMENT,
				PaymentRoutingKeys.SUCCEEDED,
				event
			)
		} else {
			// Rollback Path (Simulation Failure)
			transaction.status = PaymentStatus.FAILED
			transaction.failureReason = simResult.failureReason
			await this.paymentRepository.save(transaction)

			const durationSeconds = (Date.now() - startTime) / 1000
			this.metricsService.recordPaymentFailure(
				simResult.failureReason || 'Payment rejected',
				transaction.currency,
				durationSeconds
			)

			this.logger.warn(
				`[${correlationId}] Payment ${transaction.id} FAILED for Order ${orderId}: ${simResult.failureReason}`
			)

			// Publish payment.failed event to RabbitMQ (triggers Saga rollback)
			const event: BaseEvent<PaymentFailedPayload> = {
				eventId: uuidv4(),
				correlationId,
				timestamp: new Date().toISOString(),
				payload: {
					orderId: transaction.orderId,
					userId: transaction.userId,
					amount: Number(transaction.amount),
					currency: transaction.currency,
					reason: simResult.failureReason || 'Payment rejected',
					idempotencyKey: transaction.idempotencyKey,
					failedAt: new Date().toISOString()
				}
			}

			this.rabbitMQService.publishEvent(
				RabbitExchanges.PAYMENT,
				PaymentRoutingKeys.FAILED,
				event
			)
		}

		return {
			paymentId: transaction.id,
			orderId: transaction.orderId,
			status: transaction.status,
			amount: Number(transaction.amount),
			currency: transaction.currency,
			failureReason: transaction.failureReason,
			processedAt: new Date().toISOString()
		}
	}

	private async recordProcessedEvent(
		eventId: string,
		eventType: string
	): Promise<void> {
		try {
			const record = this.processedEventRepository.create({
				eventId
			})
			await this.processedEventRepository.save(record)
		} catch {
			// Ignore duplicate key error on event recording
		}
	}

	private async listenToSagaEvents(): Promise<void> {
		await this.rabbitMQService.consumeEvents<InventoryReservedPayload>(
			RabbitQueues.PAYMENT_INVENTORY_EVENTS,
			async (event) => {
				await this.handleInventoryReserved(event)
			}
		)

		this.logger.log('Payment Service Saga listeners successfully activated')
	}
}
