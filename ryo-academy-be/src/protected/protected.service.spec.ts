import { Test, TestingModule } from '@nestjs/testing';
import { ProtectedService } from './protected.service';
import { UsersRepository } from '../users/users.repository.js';
import { DatabaseService } from '../database/database.service.js';

describe('ProtectedService', () => {
  let service: ProtectedService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProtectedService,
        { provide: UsersRepository, useValue: {} },
        { provide: DatabaseService, useValue: {} },
      ],
    }).compile();

    service = module.get<ProtectedService>(ProtectedService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
