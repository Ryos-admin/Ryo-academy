import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdmissionPaymentService } from './admission-payment.service.js';
import { CreateAdmissionPaymentDto } from './dto/create-admission-payment.dto.js';
import { ReverseAdmissionPaymentDto } from './dto/reverse-admission-payment.dto.js';
import { JwtAuthGuard } from '../../security/token/jwt-auth.guard.js';
import { PermissionsGuard } from '../../auth/permissions.guard.js';
import { RequirePermissions } from '../../auth/require-permissions.decorator.js';
import { PERMISSIONS } from '../../auth/permissions/permission.constants.js';

@ApiTags('Admission Payments')
@Controller(['admission', 'admissions'])
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdmissionPaymentController {
  constructor(private readonly admissionPaymentService: AdmissionPaymentService) {}

  @Post(':id/payments')
  @RequirePermissions(PERMISSIONS.FEES_CREATE)
  @ApiOperation({ summary: 'Record an admission fee payment with explicit component allocations' })
  @ApiCreatedResponse({ description: 'Fee payment recorded successfully' })
  @ApiOkResponse({ description: 'Idempotent replay: original payment returned' })
  @ApiBadRequestResponse({ description: 'Invalid payment parameters, allocation mismatch, or non-cash method' })
  @ApiConflictResponse({ description: 'Idempotency conflict or concurrent mutation collision' })
  async createAdmissionPayment(
    @Param('id') id: string,
    @Body() dto: CreateAdmissionPaymentDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const actorUserId = req.user?.userId ?? req.user?.id;
    const result = await this.admissionPaymentService.createAdmissionPayment(id, dto, actorUserId);
    if (res && typeof res.status === 'function') {
      res.status(result.statusCode);
    }
    return result;
  }

  @Get(':id/payments')
  @RequirePermissions(PERMISSIONS.FEES_READ)
  @ApiOperation({ summary: 'Get payment history for an admission' })
  @ApiOkResponse({ description: 'List of admission payments and their reversal status' })
  async getAdmissionPayments(@Param('id') id: string) {
    return await this.admissionPaymentService.getAdmissionPayments(id);
  }

  @Get(':id/payments/:paymentId')
  @RequirePermissions(PERMISSIONS.FEES_READ)
  @ApiOperation({ summary: 'Get payment details and component allocations' })
  @ApiOkResponse({ description: 'Payment metadata, allocations, and reversal information' })
  @ApiNotFoundResponse({ description: 'Payment or admission not found' })
  async getPaymentDetails(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
  ) {
    return await this.admissionPaymentService.getPaymentDetails(id, paymentId);
  }

  @Post(':id/payments/:paymentId/reverse')
  @RequirePermissions(PERMISSIONS.FEES_REVERSE)
  @ApiOperation({ summary: 'Reverse a previously recorded admission fee payment in full' })
  @ApiOkResponse({ description: 'Payment reversed successfully or idempotent replay' })
  @ApiBadRequestResponse({ description: 'Missing reason or invalid reversal request' })
  @ApiConflictResponse({ description: 'Payment already reversed, missing attribution, or idempotency conflict' })
  @ApiForbiddenResponse({ description: 'Actor lacks FEES_REVERSE permission or wrong school context' })
  @ApiNotFoundResponse({ description: 'Payment or admission not found' })
  async reverseAdmissionPayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: ReverseAdmissionPaymentDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const actorUserId = req.user?.userId ?? req.user?.id;
    const result = await this.admissionPaymentService.reverseAdmissionPayment(id, paymentId, dto, actorUserId);
    if (res && typeof res.status === 'function') {
      res.status(result.statusCode);
    }
    return result;
  }
}
