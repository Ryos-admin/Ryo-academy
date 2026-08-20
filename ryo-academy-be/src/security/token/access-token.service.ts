import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AccessTokenService {
  private readonly secret: string;
  private readonly expiresIn: number;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.secret = this.getRequiredValue(configService, 'JWT_ACCESS_SECRET');

    if (this.secret.length < 32) {
      throw new Error('JWT_ACCESS_SECRET must be at least 32 characters long.');
    }

    this.expiresIn = this.getExpiresIn(
      this.getRequiredValue(configService, 'JWT_ACCESS_EXPIRES_IN'),
    );
    this.issuer = this.getRequiredValue(configService, 'JWT_ISSUER');
    this.audience = this.getRequiredValue(configService, 'JWT_AUDIENCE');
  }

  async sign(userId: string) {
    const accessToken = await this.jwtService.signAsync(
      { sub: userId },
      {
        secret: this.secret,
        algorithm: 'HS256',
        expiresIn: this.expiresIn,
        issuer: this.issuer,
        audience: this.audience,
      },
    );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.expiresIn,
    };
  }

  private getExpiresIn(value: string): number {
    const expiresIn = Number(value);

    if (
      !Number.isSafeInteger(expiresIn) ||
      expiresIn <= 0 ||
      expiresIn > 3600
    ) {
      throw new Error(
        'JWT_ACCESS_EXPIRES_IN must be a positive integer of no more than 3600 seconds.',
      );
    }

    return expiresIn;
  }

  private getRequiredValue(configService: ConfigService, key: string): string {
    const value = configService.get<string>(key);

    if (!value?.trim()) {
      throw new Error(`${key} is required.`);
    }

    return value;
  }
}
