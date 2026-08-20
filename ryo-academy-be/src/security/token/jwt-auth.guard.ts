import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Guard that validates a JWT access token from the Authorization header.
 * On success it attaches a minimal user object (userId) to the request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'] ?? request.headers['Authorization'];
    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Authorization header missing');
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid Authorization header format');
    }

    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
    const issuer = this.configService.get<string>('JWT_ISSUER');
    const audience = this.configService.get<string>('JWT_AUDIENCE');

    if (!secret || secret.length !== 32 || !issuer || !audience ) {
      throw new UnauthorizedException('Invalid JWT configuration');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret,
        algorithms: ['HS256'],
        issuer,
        audience,
      });

      // Attach minimal user info to request for downstream handlers
      if (!payload || !payload.sub) {
        throw new UnauthorizedException('Invalid or expired token');
      }

      request.user = { userId: payload.sub };
      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
