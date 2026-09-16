import { Controller } from '@nestjs/common'
import { GrpcMethod } from '@nestjs/microservices'
import {
	ConfirmPaymentRequest,
	ConfirmPaymentResponse,
	GetPaymentSessionRequest,
	GetPaymentSessionResponse,
	PAYMENT_GRPC_METHODS,
	PAYMENT_SERVICE_NAME
} from '@hermex/contracts'
import { CorrelationId } from '@hermex/core'
import { PaymentsService } from './payments.service'

@Controller()
export class PaymentsController {
	constructor(private readonly paymentsService: PaymentsService) {}

	@GrpcMethod(PAYMENT_SERVICE_NAME, PAYMENT_GRPC_METHODS.GET_PAYMENT_SESSION)
	async getPaymentSession(
		data: GetPaymentSessionRequest
	): Promise<GetPaymentSessionResponse> {
		return this.paymentsService.getPaymentSession(data.orderId)
	}

	@GrpcMethod(PAYMENT_SERVICE_NAME, PAYMENT_GRPC_METHODS.CONFIRM_PAYMENT)
	async confirmPayment(
		data: ConfirmPaymentRequest,
		@CorrelationId() correlationId?: string
	): Promise<ConfirmPaymentResponse> {
		return this.paymentsService.confirmPayment(data, correlationId)
	}
}
