import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenService } from './access-token.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [AccessTokenService, JwtAuthGuard],
  exports: [AccessTokenService, JwtAuthGuard, JwtModule],
})
export class AccessTokenModule {}
