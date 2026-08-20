import { Injectable } from '@nestjs/common';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findByEmail(email: string) {
    return this.usersRepository.findByEmail(email);
  }

  async findByEmailForAuthentication(email: string) {
    return this.usersRepository.findByEmailForAuthentication(email);
  }

  async findById(id: string) {
    return this.usersRepository.findById(id);
  }

  async create(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
  }) {
    return this.usersRepository.create(data);
  }
}
