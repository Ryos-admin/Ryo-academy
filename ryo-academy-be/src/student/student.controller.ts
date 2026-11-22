import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StudentService } from './student.service.js';
import { PaymentReversalService } from './payment-reversal.service.js';
import { JwtAuthGuard } from '../security/token/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermissions } from '../auth/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions/permission.constants.js';
import { CreateStudentFeePaymentDto } from './dto/create-student-fee-payment.dto.js';
import { ReverseStudentFeePaymentDto } from './dto/reverse-student-fee-payment.dto.js';

@ApiTags('Students')
@Controller('students')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StudentController {
  constructor(
    private readonly studentService: StudentService,
    private readonly paymentReversalService: PaymentReversalService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STUDENT_READ)
  @ApiOperation({ summary: 'List all students' })
  @ApiOkResponse({ description: 'Students returned successfully' })
  findAll() {
    return this.studentService.findAll();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.STUDENT_READ)
  @ApiOperation({ summary: 'Get a student by ID' })
  @ApiOkResponse({ description: 'Student returned successfully' })
  @ApiNotFoundResponse({ description: 'Student not found' })
  findById(@Param('id') id: string) {
    return this.studentService.findById(id);
  }

  @Get(':id/fees')
  @RequirePermissions(PERMISSIONS.FEES_READ)
  @ApiOperation({ summary: 'Get a student fee snapshot, component balances, and payment history' })
  @ApiOkResponse({ description: 'Student fee information returned successfully' })
  @ApiNotFoundResponse({ description: 'Student not found' })
  getStudentFees(@Param('id') id: string) {
    return this.studentService.getStudentFees(id);
  }

  @Post(':id/fees/payments')
  @RequirePermissions(PERMISSIONS.FEES_CREATE)
  @ApiOperation({ summary: 'Record a student fee payment against the active fee snapshot' })
  @ApiBody({ type: CreateStudentFeePaymentDto })
  @ApiOkResponse({ description: 'Student fee payment recorded successfully' })
  @ApiBadRequestResponse({ description: 'Invalid payment amount or payment exceeds outstanding balance' })
  @ApiNotFoundResponse({ description: 'Student not found' })
  recordStudentFeePayment(
    @Param('id') id: string,
    @Body() dto: CreateStudentFeePaymentDto,
    @Req() request: { user: { userId: string } },
  ) {
    return this.studentService.recordStudentFeePayment(id, dto, request.user.userId);
  }

  @Post(':id/fees/payments/:paymentId/reverse')
  @RequirePermissions(PERMISSIONS.FEES_REVERSE)
  @ApiOperation({ summary: 'Reverse a previously recorded student fee payment in full' })
  @ApiBody({ type: ReverseStudentFeePaymentDto })
  @ApiOkResponse({ description: 'Student fee payment reversed successfully' })
  @ApiBadRequestResponse({ description: 'Invalid request or payment is not eligible for reversal' })
  @ApiConflictResponse({ description: 'Payment has already been reversed or idempotency conflict' })
  @ApiForbiddenResponse({ description: 'Actor lacks FEES_REVERSE permission or is not school-scoped' })
  @ApiNotFoundResponse({ description: 'Student, admission, or fee payment not found' })
  reverseStudentFeePayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: ReverseStudentFeePaymentDto,
    @Req() request: { user: { userId: string } },
  ) {
    return this.paymentReversalService.reverseStudentFeePayment(
      id,
      paymentId,
      dto,
      request.user.userId,
    );
  }
}
