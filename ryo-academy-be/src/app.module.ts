import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module.js';
import { PasswordModule } from './security/password/password.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProtectedModule } from './protected/protected.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    PasswordModule,
    UsersModule,
    AuthModule,
    ProtectedModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
