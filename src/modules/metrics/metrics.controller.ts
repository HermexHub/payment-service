import { Controller, Get, Header, HttpCode, HttpStatus } from '@nestjs/common'
import { MetricsService } from './metrics.service'

@Controller('metrics')
export class MetricsController {
	constructor(private readonly metricsService: MetricsService) {}

	@Get()
	@HttpCode(HttpStatus.OK)
	@Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
	async getMetrics(): Promise<string> {
		return this.metricsService.getMetrics()
	}
}
