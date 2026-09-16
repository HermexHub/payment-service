import { registerAs } from '@nestjs/config'

export default registerAs('app', () => ({
	nodeEnv: process.env.NODE_ENV!,
	grpcHost: process.env.GRPC_HOST!,
	grpcPort: Number(process.env.GRPC_PORT),
	metricsPort: Number(process.env.METRICS_PORT)
}))
