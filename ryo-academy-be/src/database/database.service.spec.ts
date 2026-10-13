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
});
