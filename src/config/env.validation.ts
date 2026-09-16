import { plainToInstance } from 'class-transformer'
import {
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsString,
	validateSync
} from 'class-validator'

export enum Environment {
	Development = 'development',
	Production = 'production',
	Test = 'test'
}

export class EnvironmentVariables {
	@IsEnum(Environment, {
		message: 'NODE_ENV must be one of: development, production, test'
	})
	NODE_ENV!: Environment

	@IsString()
	@IsNotEmpty({ message: 'GRPC_HOST is required' })
	GRPC_HOST!: string

	@IsNumber({}, { message: 'GRPC_PORT must be a number' })
	GRPC_PORT!: number

	@IsString()
	@IsNotEmpty({ message: 'DB_HOST is required' })
	DB_HOST!: string

	@IsNumber({}, { message: 'DB_PORT must be a number' })
	DB_PORT!: number

	@IsString()
	@IsNotEmpty({ message: 'DB_USERNAME is required' })
	DB_USERNAME!: string

	@IsString()
	@IsNotEmpty({ message: 'DB_PASSWORD is required' })
	DB_PASSWORD!: string

	@IsString()
	@IsNotEmpty({ message: 'DB_NAME is required' })
	DB_NAME!: string

	@IsString()
	@IsNotEmpty({ message: 'RABBITMQ_URL is required' })
	RABBITMQ_URL!: string
}

export function validateEnv(
	config: Record<string, unknown>
): EnvironmentVariables {
	const validatedConfig = plainToInstance(EnvironmentVariables, config, {
		enableImplicitConversion: true
	})

	const errors = validateSync(validatedConfig, {
		skipMissingProperties: false
	})

	if (errors.length > 0) {
		const formattedErrors = errors
			.map((err) => Object.values(err.constraints || {}).join(', '))
			.join('; ')
		throw new Error(
			`❌ [Config Validation Failed in payment-service]: ${formattedErrors}`
		)
	}

	return validatedConfig
}
