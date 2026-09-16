import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import appConfig from './config/app.config'
import databaseConfig from './config/database.config'
import { validateEnv } from './config/env.validation'
import rabbitmqConfig from './config/rabbitmq.config'
import { PaymentsModule } from './modules/payments/payments.module'
import { RabbitMQModule } from './modules/rabbitmq/rabbitmq.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: [
				`.env.${process.env.NODE_ENV || 'development'}.local`,
				`.env.${process.env.NODE_ENV || 'development'}`,
				'.env'
			],
			validate: validateEnv,
			load: [appConfig, databaseConfig, rabbitmqConfig]
		}),
		TypeOrmModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => config.get('database')!
		}),
		RabbitMQModule,
		PaymentsModule
	]
})
export class AppModule {}
