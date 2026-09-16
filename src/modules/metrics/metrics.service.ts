import { Injectable } from '@nestjs/common'
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client'

@Injectable()
export class MetricsService {
	private readonly registry: Registry

	public readonly paymentsTotal: Counter<string>
	public readonly paymentDuration: Histogram<string>
	public readonly paymentFailuresTotal: Counter<string>

	constructor() {
		this.registry = new Registry()

		// System and process metrics
		collectDefaultMetrics({
			register: this.registry,
			prefix: 'hermex_'
		})

		this.paymentsTotal = new Counter({
			name: 'hermex_payments_total',
			help: 'Total payments processed by status and currency',
			labelNames: ['status', 'currency'],
			registers: [this.registry]
		})

		this.paymentDuration = new Histogram({
			name: 'hermex_payment_duration_seconds',
			help: 'Payment processing duration in seconds',
			labelNames: ['status'],
			buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
			registers: [this.registry]
		})

		this.paymentFailuresTotal = new Counter({
			name: 'hermex_payment_failures_total',
			help: 'Total payment failures categorized by reason',
			labelNames: ['reason'],
			registers: [this.registry]
		})
	}

	recordPaymentSuccess(currency: string, durationSeconds: number): void {
		this.paymentsTotal.inc({ status: 'succeeded', currency })
		this.paymentDuration.observe({ status: 'succeeded' }, durationSeconds)
	}

	recordPaymentFailure(reason: string, currency: string, durationSeconds: number): void {
		this.paymentsTotal.inc({ status: 'failed', currency })
		this.paymentDuration.observe({ status: 'failed' }, durationSeconds)
		this.paymentFailuresTotal.inc({ reason: reason || 'unknown' })
	}

	async getMetrics(): Promise<string> {
		return this.registry.metrics()
	}

	getContentType(): string {
		return this.registry.contentType
	}
}
