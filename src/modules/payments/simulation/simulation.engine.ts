import { Injectable, Logger } from '@nestjs/common'
import { PaymentScenario } from '@hermex/contracts'

export interface SimulationResult {
	success: boolean
	scenario: PaymentScenario
	failureReason?: string
}

@Injectable()
export class SimulationEngine {
	private readonly logger = new Logger(SimulationEngine.name)

	async processSimulation(
		cardNumber: string,
		requestedScenario?: string,
		delayMs = 800
	): Promise<SimulationResult> {
		const scenario = this.resolveScenario(cardNumber, requestedScenario)

		this.logger.log(
			`[SimulationEngine] Simulating payment processing with scenario: ${scenario} (delay: ${delayMs}ms)...`
		)

		if (delayMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, delayMs))
		}

		switch (scenario) {
			case PaymentScenario.INSUFFICIENT_FUNDS:
				return {
					success: false,
					scenario,
					failureReason: 'Card declined: Insufficient funds on account'
				}

			case PaymentScenario.CARD_EXPIRED:
				return {
					success: false,
					scenario,
					failureReason: 'Card declined: Card has expired'
				}

			case PaymentScenario.DECLINED_BY_BANK:
				return {
					success: false,
					scenario,
					failureReason: 'Card declined: Transaction rejected by issuing bank'
				}

			case PaymentScenario.GATEWAY_TIMEOUT:
				return {
					success: false,
					scenario,
					failureReason: 'Payment gateway timeout: No response from bank provider'
				}

			case PaymentScenario.SUCCESS:
			default:
				return {
					success: true,
					scenario: PaymentScenario.SUCCESS
				}
		}
	}

	private resolveScenario(
		cardNumber: string,
		requestedScenario?: string
	): PaymentScenario {
		// 1. Explicit scenario parameter takes highest precedence
		if (
			requestedScenario &&
			Object.values(PaymentScenario).includes(
				requestedScenario as PaymentScenario
			)
		) {
			return requestedScenario as PaymentScenario
		}

		// 2. Stripe-style test card number patterns
		const cleanCard = cardNumber.replace(/\s+/g, '')

		if (cleanCard.endsWith('0116')) {
			return PaymentScenario.INSUFFICIENT_FUNDS
		}
		if (cleanCard.endsWith('0069')) {
			return PaymentScenario.CARD_EXPIRED
		}
		if (cleanCard.endsWith('0002')) {
			return PaymentScenario.DECLINED_BY_BANK
		}
		if (cleanCard.endsWith('9999')) {
			return PaymentScenario.GATEWAY_TIMEOUT
		}
		if (cleanCard.startsWith('4242') || cleanCard.endsWith('4242')) {
			return PaymentScenario.SUCCESS
		}

		// Default to success
		return PaymentScenario.SUCCESS
	}
}
