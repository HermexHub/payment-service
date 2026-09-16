import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn
} from 'typeorm'
import { PaymentStatus } from '@hermex/contracts'

@Entity('payment_transactions')
export class PaymentTransactionEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string

	@Index()
	@Column({ type: 'varchar', length: 255 })
	orderId!: string

	@Column({ type: 'varchar', length: 255 })
	userId!: string

	@Column({ type: 'decimal', precision: 12, scale: 2 })
	amount!: number

	@Column({ type: 'varchar', length: 10, default: 'USD' })
	currency!: string

	@Column({
		type: 'enum',
		enum: PaymentStatus,
		default: PaymentStatus.PENDING
	})
	status!: PaymentStatus

	@Column({ type: 'varchar', length: 50, nullable: true })
	scenario?: string

	@Column({ type: 'text', nullable: true })
	failureReason?: string

	@Index()
	@Column({ type: 'varchar', length: 255, nullable: true })
	idempotencyKey?: string

	@CreateDateColumn({ type: 'timestamp with time zone' })
	createdAt!: Date

	@UpdateDateColumn({ type: 'timestamp with time zone' })
	updatedAt!: Date
}
