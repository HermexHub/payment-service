import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module'
import { PaymentTransactionEntity } from './entities/payment-transaction.entity'
import { ProcessedEventEntity } from './entities/processed-event.entity'
import { PaymentsController } from './payments.controller'
import { PaymentsService } from './payments.service'
import { SimulationEngine } from './simulation/simulation.engine'

@Module({
	imports: [
		TypeOrmModule.forFeature([
			PaymentTransactionEntity,
			ProcessedEventEntity
		]),
		RabbitMQModule
	],
	controllers: [PaymentsController],
	providers: [PaymentsService, SimulationEngine],
	exports: [PaymentsService]
})
export class PaymentsModule {}
