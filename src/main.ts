import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'
import {
	PAYMENT_PACKAGE_NAME,
	PAYMENT_PROTO_PATH
} from '@hermex/contracts'
import { AppModule } from './app.module'
import { GrpcTraceInterceptor, HermexLogger } from '@hermex/core'

async function bootstrap() {
	const hermexLogger = new HermexLogger({ serviceName: 'payment-service' })
	const logger = new Logger('PaymentServiceBootstrap')

	// Bootstrap Hybrid Application: gRPC Microservice + Internal Metrics Server
	const app = await NestFactory.create(AppModule, {
		logger: hermexLogger
	})

	const configService = app.get(ConfigService)
	const grpcHost = configService.get<string>('app.grpcHost') || '0.0.0.0'
	const grpcPort = configService.get<number>('app.grpcPort') || 50052
	const metricsPort = configService.get<number>('app.metricsPort') || 3003

	app.connectMicroservice<MicroserviceOptions>({
		transport: Transport.GRPC,
		options: {
			package: PAYMENT_PACKAGE_NAME,
			protoPath: PAYMENT_PROTO_PATH,
			url: `${grpcHost}:${grpcPort}`
		}
	})

	app.useLogger(hermexLogger)
	app.useGlobalInterceptors(new GrpcTraceInterceptor())
	app.enableShutdownHooks()

	await app.startAllMicroservices()
	await app.listen(metricsPort, '0.0.0.0')

	logger.log(
		`🚀 Payment Service gRPC microservice is running on: ${grpcHost}:${grpcPort}`
	)
	logger.log(
		`📊 Payment Service internal metrics listening on: http://0.0.0.0:${metricsPort}/metrics`
	)
}

bootstrap()
