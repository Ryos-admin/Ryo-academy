import { ConflictException } from '@nestjs/common';
import { UsersRepository } from './users.repository.js';
import { Prisma } from '../../generated/prisma/client.js';

describe('UsersRepository', () => {
  const db = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  } as any;

  let repository: UsersRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new UsersRepository(db);
  });

  it('findByEmailForAuthentication queries user with credentials selection', async () => {
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      passwordHash: 'hashed-secret',
      firstName: 'John',
      lastName: 'Doe',
      isActive: true,
    };
    db.user.findUnique.mockResolvedValue(mockUser);

    const result = await repository.findByEmailForAuthentication('test@example.com');

    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    });
    expect(result).toEqual(mockUser);
  });

  it('create throws ConflictException on Prisma unique constraint error (P2002)', async () => {
    const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
    });
    db.user.create.mockRejectedValue(p2002Error);

    await expect(
      repository.create({
        email: 'duplicate@example.com',
        passwordHash: 'hash',
        firstName: 'Jane',
        lastName: 'Doe',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
