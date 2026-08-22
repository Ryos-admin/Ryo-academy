import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module.js';
import { PasswordModule } from './security/password/password.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProtectedModule } from './protected/protected.module.js';
import { AcademicYearModule } from './academic/academic-year/academic-year.module.js';
import { ProgramModule } from './academic/program/program.module.js';
import { ClassModule } from './academic/class/class.module.js';
import { SectionModule } from './academic/section/section.module.js';

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
    AcademicYearModule,
    ProgramModule,
    ClassModule,
    SectionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
