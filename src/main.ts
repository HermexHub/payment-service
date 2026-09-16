import { Logger } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'
import {
	PAYMENT_PACKAGE_NAME,
	PAYMENT_PROTO_PATH
} from '@hermex/contracts'
import { AppModule } from './app.module'
import appConfig from './config/app.config'
import { validateEnv } from './config/env.validation'

async function bootstrap() {
	const logger = new Logger('PaymentServiceBootstrap')

	// Load and validate configuration independently without initializing AppModule side-effects
	const configContext = await NestFactory.createApplicationContext(
		ConfigModule.forRoot({
			envFilePath: [
				`.env.${process.env.NODE_ENV || 'development'}.local`,
				`.env.${process.env.NODE_ENV || 'development'}`,
				'.env'
			],
			validate: validateEnv,
			load: [appConfig]
		})
	)

	const configService = configContext.get(ConfigService)
	const grpcHost = configService.get<string>('app.grpcHost')!
	const grpcPort = configService.get<number>('app.grpcPort')!
	await configContext.close()

	// Bootstrap pure gRPC microservice without HTTP drivers
	const app = await NestFactory.createMicroservice<MicroserviceOptions>(
		AppModule,
		{
			transport: Transport.GRPC,
			options: {
				package: PAYMENT_PACKAGE_NAME,
				protoPath: PAYMENT_PROTO_PATH,
				url: `${grpcHost}:${grpcPort}`
			}
		}
	)

	app.enableShutdownHooks()

	await app.listen()

	logger.log(
		`🚀 Payment Service gRPC microservice is running on: ${grpcHost}:${grpcPort}`
	)
}

bootstrap()
