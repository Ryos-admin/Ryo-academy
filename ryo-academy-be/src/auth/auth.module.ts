import { Module } from '@nestjs/common';
import { PasswordModule } from '../security/password/password.module.js';
import { AccessTokenModule } from '../security/token/access-token.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [UsersModule, PasswordModule, AccessTokenModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
