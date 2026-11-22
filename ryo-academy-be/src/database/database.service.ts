import '../common/money/decimal-precision.js';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import net from 'node:net';

// Node 22 Happy Eyeballs defaults to IPv6 first. On environments where
// IPv6 routing to AWS Neon is unavailable, socket creation throws ETIMEDOUT
// after ~760ms. Disabling autoSelectFamily forces immediate IPv4 connection.
net.setDefaultAutoSelectFamily?.(false);

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DatabaseService.name);
  public readonly pool: Pool;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const pool = new Pool({
      connectionString: configService.getOrThrow<string>('DATABASE_URL'),
      keepAlive: true,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      this.logger.error(`[Database Pool Error] ${err?.message}`);
    });

    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
