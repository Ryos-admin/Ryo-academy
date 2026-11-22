import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { AdmissionStatus, FeePricingVersion, Gender } from '../../../generated/prisma/enums.js';
import { AdmissionService } from './admission.service.js';
import { AdmissionRepository } from './admission.repository.js';
import { PERMISSIONS } from '../../auth/permissions/permission.constants.js';

describe('V0 Admission Confirmation & Student Creation (BE-M4 Unit Tests)', () => {
  const schoolId = 'sch-test-1';
  const otherSchoolId = 'sch-other-2';
  const actorUserId = 'usr-admin-1';
  const admissionId = 'adm-test-1';
  const studentId = 'stu-created-1';
  const headerId = 'hdr-test-1';
  const admissionNumber = 'SCH-26-000001';

  interface HarnessOptions {
    admissionStatus?: AdmissionStatus;
    schoolIdMismatch?: boolean;
    missingSchoolContext?: boolean;
    headerPricingVersion?: FeePricingVersion;
    hasPayments?: boolean;
    payments?: any[];
    headers?: any[];
    outstandingDue?: string;
    studentLinkageCorrupt?: 'missing_student' | 'mismatched_admission_id' | 'mismatched_student_id';
    failStudentWrite?: boolean;
    failAdmissionUpdate?: boolean;
    isDeleted?: boolean;
    isActive?: boolean;
  }

  const buildHarness = (options?: HarnessOptions) => {
    let savedStudent: any = null;
    let savedAdmission: any = null;

    const existingStudent =
      options?.admissionStatus === AdmissionStatus.CONFIRMED && options?.studentLinkageCorrupt !== 'missing_student'
        ? {
            id: options?.studentLinkageCorrupt === 'mismatched_student_id' ? 'stu-mismatch-id' : studentId,
            studentName: 'Candidate Student',
            studentNumber: admissionNumber,
            studentSequence: 101,
            admissionId: options?.studentLinkageCorrupt === 'mismatched_admission_id' ? 'adm-other' : admissionId,
            gender: Gender.FEMALE,
            dateOfBirth: new Date('2015-05-15'),
            isActive: true,
            deletedAt: null,
          }
        : null;

    let admissionState: any = {
      id: admissionId,
      admissionNumber,
      admissionSequence: 1,
      admissionStatus: options?.admissionStatus ?? AdmissionStatus.DRAFT,
      schoolId: options?.schoolIdMismatch ? otherSchoolId : schoolId,
      studentName: 'Candidate Student',
      gender: Gender.FEMALE,
      dateOfBirth: new Date('2015-05-15'),
      parentName: 'Parent A',
      parentPhone: '9876543210',
      isActive: options?.isActive ?? true,
      deletedAt: options?.isDeleted ? new Date() : null,
      createdById: 'usr-creator-1',
      confirmedById: options?.admissionStatus === AdmissionStatus.CONFIRMED ? 'usr-original-confirmer' : null,
      confirmedAt: options?.admissionStatus === AdmissionStatus.CONFIRMED ? new Date('2026-11-01T10:00:00.000Z') : null,
      studentId: options?.admissionStatus === AdmissionStatus.CONFIRMED ? studentId : null,
      student: existingStudent,
    };

    const header = {
      id: headerId,
      admissionId,
      pricingVersion: options?.headerPricingVersion ?? FeePricingVersion.V0_SNAPSHOTTED,
      grossAmount: new Prisma.Decimal('1000.00'),
      discountAmount: new Prisma.Decimal('0.00'),
      netAmount: new Prisma.Decimal('1000.00'),
      totalFeeAmount: new Prisma.Decimal('1000.00'),
      totalPaidAmount: options?.hasPayments ? new Prisma.Decimal('400.00') : new Prisma.Decimal('0.00'),
      totalDueAmount: options?.outstandingDue
        ? new Prisma.Decimal(options.outstandingDue)
        : (options?.hasPayments ? new Prisma.Decimal('600.00') : new Prisma.Decimal('1000.00')),
      isActive: true,
      feePaymentDetails: [
        {
          id: 'det-1',
          feePaymentHeaderId: headerId,
          nameSnapshot: 'Tuition',
          originalAmount: new Prisma.Decimal('1000.00'),
          discountAmount: new Prisma.Decimal('0.00'),
          finalAmount: new Prisma.Decimal('1000.00'),
          totalAmountToBePaid: new Prisma.Decimal('1000.00'),
          amountPaid: options?.hasPayments ? new Prisma.Decimal('400.00') : new Prisma.Decimal('0.00'),
          isActive: true,
          isIncluded: true,
          concession: null,
        },
      ],
      payments: options?.payments !== undefined
        ? options.payments
        : (options?.hasPayments
            ? [
                {
                  id: 'pay-1',
                  admissionId,
                  feePaymentHeaderId: headerId,
                  amount: new Prisma.Decimal('400.00'),
                  reversalEvent: null,
                },
              ]
            : []),
      installmentAllocations: [],
    };

    const userState = options?.missingSchoolContext
      ? { id: actorUserId, schoolId: null }
      : { id: actorUserId, schoolId };

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      admission: {
        findUnique: jest.fn().mockImplementation(async ({ where }) =>
          where.id === admissionId ? admissionState : null
        ),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          if (options?.failAdmissionUpdate) {
            throw new Error('Database error during admission confirmation update');
          }
          admissionState = { ...admissionState, ...data };
          savedAdmission = admissionState;
          return admissionState;
        }),
      },
      student: {
        findUnique: jest.fn().mockImplementation(async ({ where }) =>
          where.admissionId === admissionId ? existingStudent : null
        ),
        create: jest.fn().mockImplementation(async ({ data }) => {
          if (options?.failStudentWrite) {
            throw new Error('Database error during student creation');
          }
          savedStudent = {
            id: studentId,
            studentSequence: 101,
            isActive: true,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          };
          admissionState.student = savedStudent;
          return savedStudent;
        }),
      },
      feePaymentHeader: {
        findMany: jest.fn().mockImplementation(async () => options?.headers ?? [header]),
        update: jest.fn(),
      },
      feePaymentDetails: {
        update: jest.fn(),
      },
    };

    const databaseService = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
      user: {
        findUnique: jest.fn().mockImplementation(async ({ where }) =>
          where.id === actorUserId ? userState : null
        ),
      },
      admission: {
        findUnique: jest.fn().mockImplementation(async ({ where }) =>
          where.id === admissionId ? admissionState : null
        ),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          admissionState = { ...admissionState, ...data };
          return admissionState;
        }),
      },
    };

    const scheduleService = {
      confirmAdmissionSchedules: jest.fn().mockResolvedValue(undefined),
    };

    const service = new AdmissionService(
      databaseService as any,
      {} as unknown as AdmissionRepository,
      scheduleService as any,
    );

    return {
      service,
      tx,
      databaseService,
      scheduleService,
      getSavedStudent: () => savedStudent,
      getSavedAdmission: () => savedAdmission,
      getAdmissionState: () => admissionState,
    };
  };

  describe('1. First-time confirmation and complete Student field mapping', () => {
    it('confirms a DRAFT admission and creates a Student with exact mapped fields', async () => {
      const { service, tx, getSavedStudent, getSavedAdmission } = buildHarness({ hasPayments: true });

      const result = await service.confirmAdmission(admissionId, { id: actorUserId });

      expect(result.statusCode).toBe(200);
      expect(result.isReplay).toBe(false);
      expect(result.admissionStatus).toBe(AdmissionStatus.CONFIRMED);
      expect(result.student).toBeDefined();

      // Student mapping assertions
      const student = getSavedStudent();
      expect(student).not.toBeNull();
      expect(student.studentName).toBe('Candidate Student');
      expect(student.studentNumber).toBe(admissionNumber);
      expect(student.gender).toBe(Gender.FEMALE);
      expect(student.dateOfBirth).toEqual(new Date('2015-05-15'));
      expect(student.admissionId).toBe(admissionId);
      // Student sequence is NOT copied from admissionSequence (PostgreSQL default generates it)
      expect(tx.student.create).toHaveBeenCalledWith({
        data: {
          admissionId,
          studentName: 'Candidate Student',
          studentNumber: admissionNumber,
          gender: Gender.FEMALE,
          dateOfBirth: new Date('2015-05-15'),
        },
      });

      // Admission update and audit assertions
      const updated = getSavedAdmission();
      expect(updated.admissionStatus).toBe(AdmissionStatus.CONFIRMED);
      expect(updated.studentId).toBe(studentId);
      expect(updated.confirmedById).toBe(actorUserId);
      expect(updated.confirmedAt).toBeInstanceOf(Date);
    });
  });

  describe('2. Outstanding balance does not block confirmation', () => {
    it('confirms an admission with a full outstanding balance when partial payment exists', async () => {
      const { service } = buildHarness({ hasPayments: true, outstandingDue: '600.00' });

      const result = await service.confirmAdmission(admissionId, { id: actorUserId });

      expect(result.statusCode).toBe(200);
      expect(result.admissionStatus).toBe(AdmissionStatus.CONFIRMED);
      expect(result.student).toBeDefined();
    });
  });

  describe('3. Existing payment does not block confirmation', () => {
    it('confirms an admission that already has fee payments recorded', async () => {
      const { service } = buildHarness({ hasPayments: true, outstandingDue: '600.00' });

      const result = await service.confirmAdmission(admissionId, { id: actorUserId });

      expect(result.statusCode).toBe(200);
      expect(result.isReplay).toBe(false);
      expect(result.admissionStatus).toBe(AdmissionStatus.CONFIRMED);
    });
  });

  describe('4. No fee snapshot or payment projection mutation', () => {
    it('preserves fee snapshots and does not invoke header or detail updates', async () => {
      const { service, tx, scheduleService } = buildHarness({ hasPayments: true });

      await service.confirmAdmission(admissionId, { id: actorUserId });

      expect(tx.feePaymentHeader.update).not.toHaveBeenCalled();
      expect(tx.feePaymentDetails.update).not.toHaveBeenCalled();
      expect(scheduleService.confirmAdmissionSchedules).not.toHaveBeenCalled();
    });
  });

  describe('5. Idempotent replay', () => {
    it('returns 200 OK with isReplay: true and existing Student on repeated confirmation', async () => {
      const originalConfirmedAt = new Date('2026-11-01T10:00:00.000Z');
      const { service, tx } = buildHarness({ admissionStatus: AdmissionStatus.CONFIRMED });

      const result = await service.confirmAdmission(admissionId, { id: actorUserId });

      expect(result.statusCode).toBe(200);
      expect(result.isReplay).toBe(true);
      expect(result.admissionStatus).toBe(AdmissionStatus.CONFIRMED);
      expect(result.student.id).toBe(studentId);
      expect(result.confirmedById).toBe('usr-original-confirmer');
      expect(result.confirmedAt).toEqual(originalConfirmedAt);

      // Must not create another Student or update Admission
      expect(tx.student.create).not.toHaveBeenCalled();
      expect(tx.admission.update).not.toHaveBeenCalled();
    });
  });

  describe('6. Corrupted confirmed Admission with missing Student', () => {
    it('throws 409 Conflict if admission is CONFIRMED but linked Student is missing', async () => {
      const { service } = buildHarness({
        admissionStatus: AdmissionStatus.CONFIRMED,
        studentLinkageCorrupt: 'missing_student',
      });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toMatchObject({
        response: expect.objectContaining({
          message: expect.stringContaining('missing or inconsistent Student linkage'),
        }),
      });
    });
  });

  describe('7. Mismatched Student.admissionId', () => {
    it('throws 409 Conflict if linked Student points to a different admissionId', async () => {
      const { service } = buildHarness({
        admissionStatus: AdmissionStatus.CONFIRMED,
        studentLinkageCorrupt: 'mismatched_admission_id',
      });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toMatchObject({
        response: expect.objectContaining({
          message: expect.stringContaining('missing or inconsistent Student linkage'),
        }),
      });
    });
  });

  describe('8. Mismatched Admission.studentId', () => {
    it('throws 409 Conflict if Admission.studentId does not match Student.id', async () => {
      const { service } = buildHarness({
        admissionStatus: AdmissionStatus.CONFIRMED,
        studentLinkageCorrupt: 'mismatched_student_id',
      });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toMatchObject({
        response: expect.objectContaining({
          message: expect.stringContaining('missing or inconsistent Student linkage'),
        }),
      });
    });
  });

  describe('9. Mandatory locking & raw query enforcement', () => {
    it('acquires Admission FOR UPDATE and throws if $queryRaw is unavailable', async () => {
      const { service, tx } = buildHarness({ hasPayments: true });

      await service.confirmAdmission(admissionId, { id: actorUserId });

      expect(tx.$queryRaw).toHaveBeenCalled();

      // If $queryRaw is not a function, fail safely
      (tx as any).$queryRaw = undefined;
      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toThrow(
        'Mandatory transaction raw locking ($queryRaw) is unavailable',
      );
    });
  });

  describe('10. Atomic rollback on Student creation failure', () => {
    it('rolls back whole transaction when tx.student.create fails', async () => {
      const { service, tx } = buildHarness({ hasPayments: true, failStudentWrite: true });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toThrow(
        'Database error during student creation',
      );

      // Admission update must not have executed
      expect(tx.admission.update).not.toHaveBeenCalled();
    });
  });

  describe('11. Atomic rollback on Admission update failure', () => {
    it('rolls back whole transaction when tx.admission.update fails', async () => {
      const { service } = buildHarness({ hasPayments: true, failAdmissionUpdate: true });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toThrow(
        'Database error during admission confirmation update',
      );
    });
  });

  describe('12. Missing actor school context', () => {
    it('throws 403 Forbidden when actor has no associated schoolId', async () => {
      const { service } = buildHarness({ missingSchoolContext: true });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('13. Cross-school access rejection', () => {
    it('throws 404 Not Found before evaluating replay when actor school does not match admission school', async () => {
      const { service } = buildHarness({ schoolIdMismatch: true });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 Not Found even if admission is already CONFIRMED in another school', async () => {
      const { service } = buildHarness({
        admissionStatus: AdmissionStatus.CONFIRMED,
        schoolIdMismatch: true,
      });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('14. Inactive or soft-deleted admission rejection', () => {
    it('throws 404 Not Found if admission is soft-deleted', async () => {
      const { service } = buildHarness({ isDeleted: true });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 Not Found if admission isActive is false', async () => {
      const { service } = buildHarness({ isActive: false });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('15. CANCELLED and unsupported status rejection', () => {
    it('throws 409 Conflict when attempting to confirm a CANCELLED admission', async () => {
      const { service } = buildHarness({ admissionStatus: AdmissionStatus.CANCELLED });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toMatchObject({
        response: expect.objectContaining({
          message: 'Cancelled admissions cannot be confirmed.',
        }),
      });
    });

    it('throws 409 Conflict when attempting to confirm an unsupported status', async () => {
      const { service } = buildHarness({ admissionStatus: 'PENDING' as any });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toMatchObject({
        response: expect.objectContaining({
          message: expect.stringContaining('cannot be confirmed from status PENDING'),
        }),
      });
    });
  });

  describe('16. Ordinary Admission editing blocked after confirmation', () => {
    it('rejects ordinary edits to confirmed admissions via updateById with 400 Bad Request', async () => {
      const { service, databaseService } = buildHarness({ admissionStatus: AdmissionStatus.CONFIRMED });

      await expect(
        service.updateById(admissionId, { studentName: 'New Name' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          message: 'Ordinary admission editing is blocked after confirmation.',
        }),
      });

      expect(databaseService.admission.update).not.toHaveBeenCalled();
    });

    it('allows ordinary edits on DRAFT admissions', async () => {
      const { service, databaseService } = buildHarness({ admissionStatus: AdmissionStatus.DRAFT });

      await service.updateById(admissionId, { studentName: 'Draft Edited Name' });

      expect(databaseService.admission.update).toHaveBeenCalledWith({
        where: { id: admissionId },
        data: expect.objectContaining({ studentName: 'Draft Edited Name' }),
      });
    });
  });

  describe('17. Legacy vs V0 regression behavior', () => {
    it('executes legacy concession/schedule validation when header is LEGACY', async () => {
      const { service, scheduleService } = buildHarness({
        headerPricingVersion: FeePricingVersion.LEGACY,
        hasPayments: true,
      });

      await service.confirmAdmission(admissionId, { id: actorUserId });

      expect(scheduleService.confirmAdmissionSchedules).toHaveBeenCalled();
    });

    it('bypasses legacy concession/schedule validation when header is V0_SNAPSHOTTED', async () => {
      const { service, scheduleService } = buildHarness({
        headerPricingVersion: FeePricingVersion.V0_SNAPSHOTTED,
        hasPayments: true,
      });

      await service.confirmAdmission(admissionId, { id: actorUserId });

      expect(scheduleService.confirmAdmissionSchedules).not.toHaveBeenCalled();
    });
  });

  describe('18. updateStatusById backwards-compatibility delegation', () => {
    it('delegates CONFIRMED status directly to confirmAdmission', async () => {
      const { service } = buildHarness({ hasPayments: true });
      const spy = jest.spyOn(service, 'confirmAdmission');

      await service.updateStatusById(admissionId, { id: actorUserId }, 'CONFIRMED');

      expect(spy).toHaveBeenCalledWith(admissionId, { id: actorUserId });
    });
  });

  describe('19. Permission constant alignment', () => {
    it('aligns with PERMISSIONS.ADMISSION_CREATE requirement', () => {
      expect(PERMISSIONS.ADMISSION_CREATE).toBe('admission:create');
    });
  });

  describe('20. Admission Confirmation Payment Prerequisite (BE-ND1)', () => {
    it('1. rejects confirmation when no payments exist', async () => {
      const { service, tx, getSavedStudent } = buildHarness({ payments: [] });

      try {
        await service.confirmAdmission(admissionId, { id: actorUserId });
        fail('Expected confirmation to fail with ConflictException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getStatus()).toBe(409);
        expect(err.getResponse()).toEqual({
          code: 'CONFIRMATION_PAYMENT_REQUIRED',
          message:
            'At least one successful, unreversed payment greater than zero is required before confirming admission.',
        });
      }

      expect(tx.student.create).not.toHaveBeenCalled();
      expect(tx.admission.update).not.toHaveBeenCalled();
      expect(getSavedStudent()).toBeNull();
    });

    it('2. rejects confirmation when only a zero-value payment exists', async () => {
      const { service, tx } = buildHarness({
        payments: [
          {
            id: 'pay-0',
            admissionId,
            feePaymentHeaderId: headerId,
            amount: new Prisma.Decimal('0.00'),
            reversalEvent: null,
          },
        ],
      });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toMatchObject({
        response: {
          code: 'CONFIRMATION_PAYMENT_REQUIRED',
          message:
            'At least one successful, unreversed payment greater than zero is required before confirming admission.',
        },
      });
      expect(tx.student.create).not.toHaveBeenCalled();
    });

    it('3. rejects confirmation when only a negative-value payment exists', async () => {
      const { service, tx } = buildHarness({
        payments: [
          {
            id: 'pay-neg',
            admissionId,
            feePaymentHeaderId: headerId,
            amount: new Prisma.Decimal('-50.00'),
            reversalEvent: null,
          },
        ],
      });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toMatchObject({
        response: {
          code: 'CONFIRMATION_PAYMENT_REQUIRED',
          message:
            'At least one successful, unreversed payment greater than zero is required before confirming admission.',
        },
      });
      expect(tx.student.create).not.toHaveBeenCalled();
    });

    it('4. rejects confirmation when payment has been fully reversed', async () => {
      const { service, tx } = buildHarness({
        payments: [
          {
            id: 'pay-rev',
            admissionId,
            feePaymentHeaderId: headerId,
            amount: new Prisma.Decimal('400.00'),
            reversalEvent: {
              id: 'rev-1',
              feePaymentId: 'pay-rev',
              reversalAmount: new Prisma.Decimal('400.00'),
            },
          },
        ],
      });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toMatchObject({
        response: {
          code: 'CONFIRMATION_PAYMENT_REQUIRED',
          message:
            'At least one successful, unreversed payment greater than zero is required before confirming admission.',
        },
      });
      expect(tx.student.create).not.toHaveBeenCalled();
    });

    it('5. rejects confirmation when payment has null or incorrect admission ownership', async () => {
      const { service: foreignService } = buildHarness({
        payments: [
          {
            id: 'pay-foreign-adm',
            admissionId: 'other-admission-id',
            feePaymentHeaderId: headerId,
            amount: new Prisma.Decimal('400.00'),
            reversalEvent: null,
          },
        ],
      });

      await expect(foreignService.confirmAdmission(admissionId, { id: actorUserId })).rejects.toMatchObject({
        response: {
          code: 'CONFIRMATION_PAYMENT_REQUIRED',
          message:
            'At least one successful, unreversed payment greater than zero is required before confirming admission.',
        },
      });

      const { service: nullService } = buildHarness({
        payments: [
          {
            id: 'pay-null-adm',
            admissionId: null,
            feePaymentHeaderId: headerId,
            amount: new Prisma.Decimal('400.00'),
            reversalEvent: null,
          },
        ],
      });

      await expect(nullService.confirmAdmission(admissionId, { id: actorUserId })).rejects.toMatchObject({
        response: {
          code: 'CONFIRMATION_PAYMENT_REQUIRED',
          message:
            'At least one successful, unreversed payment greater than zero is required before confirming admission.',
        },
      });
    });

    it('6. rejects confirmation when payment has null or incorrect header ownership', async () => {
      const { service: foreignService } = buildHarness({
        payments: [
          {
            id: 'pay-foreign-hdr',
            admissionId,
            feePaymentHeaderId: 'unrelated-header-id',
            amount: new Prisma.Decimal('400.00'),
            reversalEvent: null,
          },
        ],
      });

      await expect(foreignService.confirmAdmission(admissionId, { id: actorUserId })).rejects.toMatchObject({
        response: {
          code: 'CONFIRMATION_PAYMENT_REQUIRED',
          message:
            'At least one successful, unreversed payment greater than zero is required before confirming admission.',
        },
      });

      const { service: nullService } = buildHarness({
        payments: [
          {
            id: 'pay-null-hdr',
            admissionId,
            feePaymentHeaderId: null,
            amount: new Prisma.Decimal('400.00'),
            reversalEvent: null,
          },
        ],
      });

      await expect(nullService.confirmAdmission(admissionId, { id: actorUserId })).rejects.toMatchObject({
        response: {
          code: 'CONFIRMATION_PAYMENT_REQUIRED',
          message:
            'At least one successful, unreversed payment greater than zero is required before confirming admission.',
        },
      });
    });

    it('7. confirms successfully when one header has a reversed payment and another active header has a qualifying payment', async () => {
      const headerA = {
        id: 'hdr-a',
        admissionId,
        isActive: true,
        pricingVersion: FeePricingVersion.V0_SNAPSHOTTED,
        grossAmount: new Prisma.Decimal('500.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        netAmount: new Prisma.Decimal('500.00'),
        totalFeeAmount: new Prisma.Decimal('500.00'),
        totalPaidAmount: new Prisma.Decimal('0.00'),
        totalDueAmount: new Prisma.Decimal('500.00'),
        feePaymentDetails: [],
        payments: [
          {
            id: 'pay-a-rev',
            admissionId,
            feePaymentHeaderId: 'hdr-a',
            amount: new Prisma.Decimal('500.00'),
            reversalEvent: { id: 'rev-a', feePaymentId: 'pay-a-rev' },
          },
        ],
      };

      const headerB = {
        id: 'hdr-b',
        admissionId,
        isActive: true,
        pricingVersion: FeePricingVersion.V0_SNAPSHOTTED,
        grossAmount: new Prisma.Decimal('500.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        netAmount: new Prisma.Decimal('500.00'),
        totalFeeAmount: new Prisma.Decimal('500.00'),
        totalPaidAmount: new Prisma.Decimal('200.00'),
        totalDueAmount: new Prisma.Decimal('300.00'),
        feePaymentDetails: [],
        payments: [
          {
            id: 'pay-b-valid',
            admissionId,
            feePaymentHeaderId: 'hdr-b',
            amount: new Prisma.Decimal('200.00'),
            reversalEvent: null,
          },
        ],
      };

      const { service, tx } = buildHarness({ headers: [headerA, headerB] });

      const result = await service.confirmAdmission(admissionId, { id: actorUserId });
      expect(result.statusCode).toBe(200);
      expect(result.admissionStatus).toBe(AdmissionStatus.CONFIRMED);
      expect(tx.student.create).toHaveBeenCalled();
    });

    it('8. rejects confirmation when qualifying payment is only on an inactive header and active header is reversed', async () => {
      const inactiveHeader = {
        id: 'hdr-inactive',
        admissionId,
        isActive: false,
        pricingVersion: FeePricingVersion.V0_SNAPSHOTTED,
        grossAmount: new Prisma.Decimal('500.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        netAmount: new Prisma.Decimal('500.00'),
        totalFeeAmount: new Prisma.Decimal('500.00'),
        totalPaidAmount: new Prisma.Decimal('500.00'),
        totalDueAmount: new Prisma.Decimal('0.00'),
        feePaymentDetails: [],
        payments: [
          {
            id: 'pay-inactive-valid',
            admissionId,
            feePaymentHeaderId: 'hdr-inactive',
            amount: new Prisma.Decimal('500.00'),
            reversalEvent: null,
          },
        ],
      };

      const activeHeader = {
        id: 'hdr-active',
        admissionId,
        isActive: true,
        pricingVersion: FeePricingVersion.V0_SNAPSHOTTED,
        grossAmount: new Prisma.Decimal('500.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        netAmount: new Prisma.Decimal('500.00'),
        totalFeeAmount: new Prisma.Decimal('500.00'),
        totalPaidAmount: new Prisma.Decimal('0.00'),
        totalDueAmount: new Prisma.Decimal('500.00'),
        feePaymentDetails: [],
        payments: [
          {
            id: 'pay-active-rev',
            admissionId,
            feePaymentHeaderId: 'hdr-active',
            amount: new Prisma.Decimal('500.00'),
            reversalEvent: { id: 'rev-active', feePaymentId: 'pay-active-rev' },
          },
        ],
      };

      const { service, tx } = buildHarness({ headers: [inactiveHeader, activeHeader] });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toMatchObject({
        response: {
          code: 'CONFIRMATION_PAYMENT_REQUIRED',
          message:
            'At least one successful, unreversed payment greater than zero is required before confirming admission.',
        },
      });
      expect(tx.student.create).not.toHaveBeenCalled();
    });

    it('9. confirms successfully when valid partial payment exists', async () => {
      const { service, tx } = buildHarness({
        hasPayments: true,
        outstandingDue: '750.00',
        payments: [
          {
            id: 'pay-partial',
            admissionId,
            feePaymentHeaderId: headerId,
            amount: new Prisma.Decimal('250.00'),
            reversalEvent: null,
          },
        ],
      });

      const result = await service.confirmAdmission(admissionId, { id: actorUserId });
      expect(result.statusCode).toBe(200);
      expect(result.admissionStatus).toBe(AdmissionStatus.CONFIRMED);
      expect(tx.student.create).toHaveBeenCalled();
    });

    it('10. confirms successfully when valid full payment exists', async () => {
      const { service, tx } = buildHarness({
        hasPayments: true,
        outstandingDue: '0.00',
        payments: [
          {
            id: 'pay-full',
            admissionId,
            feePaymentHeaderId: headerId,
            amount: new Prisma.Decimal('1000.00'),
            reversalEvent: null,
          },
        ],
      });

      const result = await service.confirmAdmission(admissionId, { id: actorUserId });
      expect(result.statusCode).toBe(200);
      expect(result.admissionStatus).toBe(AdmissionStatus.CONFIRMED);
      expect(tx.student.create).toHaveBeenCalled();
    });

    it('11. confirms successfully with mixed reversed and unreversed payments on active header', async () => {
      const { service, tx } = buildHarness({
        hasPayments: true,
        payments: [
          {
            id: 'pay-1-rev',
            admissionId,
            feePaymentHeaderId: headerId,
            amount: new Prisma.Decimal('400.00'),
            reversalEvent: { id: 'rev-1', feePaymentId: 'pay-1-rev' },
          },
          {
            id: 'pay-2-valid',
            admissionId,
            feePaymentHeaderId: headerId,
            amount: new Prisma.Decimal('100.00'),
            reversalEvent: null,
          },
        ],
      });

      const result = await service.confirmAdmission(admissionId, { id: actorUserId });
      expect(result.statusCode).toBe(200);
      expect(result.admissionStatus).toBe(AdmissionStatus.CONFIRMED);
      expect(tx.student.create).toHaveBeenCalled();
    });

    it('12. preserves idempotent replay for already-confirmed admission even with zero payments', async () => {
      const { service, tx } = buildHarness({
        admissionStatus: AdmissionStatus.CONFIRMED,
        payments: [],
      });

      const result = await service.confirmAdmission(admissionId, { id: actorUserId });
      expect(result.statusCode).toBe(200);
      expect(result.isReplay).toBe(true);
      expect(result.admissionStatus).toBe(AdmissionStatus.CONFIRMED);
      expect(tx.student.create).not.toHaveBeenCalled();
    });

    it('13. guarantees complete transaction rollback leaving Student and Admission untouched on rejection', async () => {
      const { service, tx, getSavedStudent, getAdmissionState } = buildHarness({ payments: [] });

      await expect(service.confirmAdmission(admissionId, { id: actorUserId })).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(tx.student.create).not.toHaveBeenCalled();
      expect(tx.admission.update).not.toHaveBeenCalled();
      expect(tx.feePaymentHeader.update).not.toHaveBeenCalled();
      expect(tx.feePaymentDetails.update).not.toHaveBeenCalled();

      // State remains in DRAFT with no Student
      expect(getSavedStudent()).toBeNull();
      expect(getAdmissionState().admissionStatus).toBe(AdmissionStatus.DRAFT);
      expect(getAdmissionState().confirmedAt).toBeNull();
      expect(getAdmissionState().confirmedById).toBeNull();
    });
  });
});
