import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm'

@Entity('processed_events')
export class ProcessedEventEntity {
	@PrimaryColumn({ type: 'varchar', length: 255 })
	eventId!: string

	@CreateDateColumn({ type: 'timestamp with time zone' })
	processedAt!: Date
}
