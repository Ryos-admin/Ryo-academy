import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service.js';
import { ConfigService } from '@nestjs/config';

describe('DatabaseService', () => {
  let service: DatabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabaseService, { provide: ConfigService, useValue: { getOrThrow: () => 'postgresql://localhost/test' } }],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should connect on onModuleInit and disconnect on onModuleDestroy', async () => {
    const connectSpy = jest.spyOn(service, '$connect').mockResolvedValue(undefined as never);
    const disconnectSpy = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined as never);
    const poolEndSpy = jest.spyOn((service as any).pool, 'end').mockResolvedValue(undefined as never);

    await service.onModuleInit();
    expect(connectSpy).toHaveBeenCalledTimes(1);

    await service.onModuleDestroy();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(poolEndSpy).toHaveBeenCalledTimes(1);
  });
});
