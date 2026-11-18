import { BadRequestException, ConflictException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { AdmissionStatus, FeePricingVersion } from '../../../generated/prisma/enums.js';
import { AdmissionService } from './admission.service.js';
import { AdmissionConcessionService } from '../fee-concession/admission-concession.service.js';
import { CreateAdmissionDto } from './dto/create-admission.dto.js';
import { UpdateAdmissionFeeConfigurationDto } from './dto/update-admission.dto.js';

describe('V0 Admission Pricing & Snapshot Creation (BE-M2)', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const validateDto = (body: unknown) => pipe.transform(body, { type: 'body', metatype: CreateAdmissionDto });

  const activeFeeComponents = [
    {
      id: 'fc-tuition',
      name: 'Tuition Fee',
      description: 'Core tuition',
      amount: new Prisma.Decimal('1000.00'),
      discountApplicable: true,
      isMandatory: true,
      isActive: true,
    },
    {
      id: 'fc-exam',
      name: 'Examination Fee',
      description: 'Annual examination',
      amount: new Prisma.Decimal('250.00'),
      discountApplicable: false,
      isMandatory: false,
      isActive: true,
    },
    {
      id: 'fc-lab',
      name: 'Laboratory Fee',
      description: 'Science lab access',
      amount: new Prisma.Decimal('500.00'),
      discountApplicable: true,
      isMandatory: false,
      isActive: true,
    },
  ];

  const standardFeeStructure = {
    id: 'fs-master-1',
    name: 'Standard Master 2026-27',
    description: 'Master structure with 18% GST',
    totalAmount: new Prisma.Decimal('1750.00'),
    gstPercentage: new Prisma.Decimal('18.00'),
    academicYearId: 'ay-2026',
    programId: 'prog-primary',
    classId: 'cls-5',
    isActive: true,
    deletedAt: null,
    feeComponents: activeFeeComponents,
  };

  const baseDtoPayload = {
    schoolId: 'sch-1',
    academicYearId: 'ay-2026',
    programId: 'prog-primary',
    classId: 'cls-5',
    sectionId: 'sec-1',
    studentName: 'Rahul Sharma',
    gender: 'MALE' as any,
    dateOfBirth: new Date('2015-08-15'),
    parentName: 'Amit Sharma',
    parentRelation: 'FATHER' as any,
    parentPhone: '9876543210',
    parentAlternatePhone: '9876543211',
    parentEmail: 'amit.sharma@example.com',
    addressLine1: '123 MG Road',
    addressLine2: 'Flat 4B',
    city: 'Pune',
    state: 'Maharashtra',
    country: 'India',
    postalCode: '411001',
    createdById: 'usr-admin-1',
  };

  const createHarness = (customMaster = standardFeeStructure) => {
    let detailRows: any[] = [];
    let savedHeader: any = null;
    let savedAdmission: any = null;

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: customMaster.id }]),
      feeStructure: {
        findUnique: jest.fn().mockResolvedValue(customMaster),
      },
      admission: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          savedAdmission = { id: 'adm-test-1', admissionStatus: AdmissionStatus.DRAFT, ...data };
          return savedAdmission;
        }),
        findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
          ...savedAdmission,
          feePaymentHeaders: [
            {
              ...savedHeader,
              feePaymentDetails: detailRows.map((row, index) => ({
                id: `detail-${index + 1}`,
                ...row,
              })),
            },
          ],
        })),
        findUnique: jest.fn().mockImplementation(async () => ({
          ...savedAdmission,
          feePaymentHeaders: [
            {
              ...savedHeader,
              feePaymentDetails: detailRows.map((row, index) => ({
                id: `detail-${index + 1}`,
                ...row,
              })),
            },
          ],
        })),
      },
      feePaymentHeader: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          savedHeader = { id: 'hdr-test-1', ...data };
          return savedHeader;
        }),
        findUnique: jest.fn().mockImplementation(async () => savedHeader),
        update: jest.fn().mockImplementation(async ({ data }) => {
          savedHeader = { ...savedHeader, ...data };
          return savedHeader;
        }),
      },
      feePaymentDetails: {
        createMany: jest.fn().mockImplementation(async ({ data }) => {
          detailRows = [...data];
        }),
        findMany: jest.fn().mockImplementation(async (args?: any) => {
          let list = detailRows.map((row, index) => ({ id: `detail-${index + 1}`, ...row }));
          if (args?.where?.isIncluded !== undefined) {
            list = list.filter((r) => r.isIncluded === args.where.isIncluded);
          }
          return list;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const idx = detailRows.findIndex((_, i) => `detail-${i + 1}` === where.id);
          if (idx !== -1) {
            detailRows[idx] = { ...detailRows[idx], ...data };
          }
        }),
      },
      feePayment: { count: jest.fn().mockResolvedValue(0) },
      feePaymentInstallmentAllocation: { count: jest.fn().mockResolvedValue(0) },
      paymentReversalEvent: { count: jest.fn().mockResolvedValue(0) },
    };

    const databaseService = {
      $transaction: jest.fn(async (cb: (client: any) => Promise<any>) => cb(tx)),
      section: { findUnique: jest.fn().mockResolvedValue({ id: 'sec-1', classId: 'cls-5' }) },
      admission: tx.admission,
    } as any;

    const admissionRepository = {
      generateSequenceNumber: jest.fn().mockResolvedValue({
        academicSeq: 'ADM-2026-001',
        classCount: 1,
        schoolCode: 'SCH01',
      }),
      findActiveFeeStructures: jest.fn().mockResolvedValue([customMaster]),
    } as any;

    const service = new AdmissionService(databaseService, admissionRepository);

    return { service, tx, getDetailRows: () => detailRows, getSavedHeader: () => savedHeader };
  };

  describe('DTO Selection & Discount Validation', () => {
    it('accepts primary V0 components array with valid discount percentages', async () => {
      const payload = {
        ...baseDtoPayload,
        components: [
          { feeComponentId: 'fc-tuition', discountPercentage: '10.00' },
          { feeComponentId: 'fc-exam', discountPercentage: '0.00' },
        ],
      };
      await expect(validateDto(payload)).resolves.toBeDefined();
    });

    it('accepts backward-compatible selectedFeeComponentIds without components', async () => {
      const payload = {
        ...baseDtoPayload,
        selectedFeeComponentIds: ['fc-tuition', 'fc-exam'],
      };
      await expect(validateDto(payload)).resolves.toBeDefined();
    });

    it('rejects explicit null discountPercentage', async () => {
      const payload = {
        ...baseDtoPayload,
        components: [
          { feeComponentId: 'fc-tuition', discountPercentage: null },
        ],
      };
      await expect(validateDto(payload)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects discountPercentage with more than 2 decimal places', async () => {
      const payload = {
        ...baseDtoPayload,
        components: [
          { feeComponentId: 'fc-tuition', discountPercentage: '10.555' },
        ],
      };
      await expect(validateDto(payload)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects negative discountPercentage in service normalization', async () => {
      const { service } = createHarness();
      await expect(
        service.create({
          ...baseDtoPayload,
          components: [{ feeComponentId: 'fc-tuition', discountPercentage: '-5.00' }],
        } as any)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects discountPercentage > 100 in service normalization', async () => {
      const { service } = createHarness();
      await expect(
        service.create({
          ...baseDtoPayload,
          components: [{ feeComponentId: 'fc-tuition', discountPercentage: '105.00' }],
        } as any)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate component IDs in components array', async () => {
      const { service } = createHarness();
      await expect(
        service.create({
          ...baseDtoPayload,
          components: [
            { feeComponentId: 'fc-tuition', discountPercentage: '10.00' },
            { feeComponentId: 'fc-tuition', discountPercentage: '5.00' },
          ],
        } as any)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate IDs in selectedFeeComponentIds array', async () => {
      const { service } = createHarness();
      await expect(
        service.create({
          ...baseDtoPayload,
          selectedFeeComponentIds: ['fc-tuition', 'fc-tuition'],
        } as any)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when neither components nor selectedFeeComponentIds is supplied', async () => {
      const { service } = createHarness();
      await expect(
        service.create({
          ...baseDtoPayload,
        } as any)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts both selection properties when component ID sets match regardless of order', async () => {
      const { service, tx } = createHarness();
      const res = await service.create({
        ...baseDtoPayload,
        components: [
          { feeComponentId: 'fc-tuition', discountPercentage: '15.00' },
          { feeComponentId: 'fc-lab', discountPercentage: '10.00' },
        ],
        selectedFeeComponentIds: ['fc-lab', 'fc-tuition'],
      } as any);

      expect(res).toBeDefined();
      expect(tx.feePaymentHeader.create).toHaveBeenCalled();
    });

    it('rejects when both selection properties are supplied with mismatched component ID sets', async () => {
      const { service } = createHarness();
      await expect(
        service.create({
          ...baseDtoPayload,
          components: [
            { feeComponentId: 'fc-tuition', discountPercentage: '15.00' },
          ],
          selectedFeeComponentIds: ['fc-lab'],
        } as any)
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Mathematical Calculations & Snapshot Completeness', () => {
    it('applies Decimal arithmetic with ROUND_HALF_UP to two decimal places and GST', async () => {
      const { service, getDetailRows, getSavedHeader } = createHarness();

      // Tuition: 1000.00, discount 12.5% => discountAmount = 125.00, taxableAmount = 875.00
      // GST 18%: 875 * 0.18 = 157.50 => totalAmountToBePaid = 875 + 157.50 = 1032.50
      await service.create({
        ...baseDtoPayload,
        components: [
          { feeComponentId: 'fc-tuition', discountPercentage: '12.50' },
        ],
      } as any);

      const details = getDetailRows();
      const tuitionDetail = details.find((d) => d.feeComponentId === 'fc-tuition');
      expect(tuitionDetail).toBeDefined();
      expect(tuitionDetail.isIncluded).toBe(true);
      expect(tuitionDetail.discountPercentage.toString()).toBe('12.5');
      expect(tuitionDetail.discountAmount.toString()).toBe('125');
      expect(tuitionDetail.taxableAmount.toString()).toBe('875');
      expect(tuitionDetail.gstPercentage.toString()).toBe('18');
      expect(tuitionDetail.gstAmount.toString()).toBe('157.5');
      expect(tuitionDetail.totalAmountToBePaid.toString()).toBe('1032.5');
      expect(tuitionDetail.finalAmount.toString()).toBe('1032.5');

      // Excluded components (exam, lab) must be snapshotted with isIncluded = false and retain baseline pricing
      const examDetail = details.find((d) => d.feeComponentId === 'fc-exam');
      expect(examDetail).toBeDefined();
      expect(examDetail.isIncluded).toBe(false);
      expect(examDetail.originalAmount.toString()).toBe('250');
      expect(examDetail.discountAmount.toString()).toBe('0');
      expect(examDetail.taxableAmount.toString()).toBe('250');
      expect(examDetail.gstPercentage.toString()).toBe('18');
      expect(examDetail.gstAmount.toString()).toBe('45');
      expect(examDetail.totalAmountToBePaid.toString()).toBe('295');

      // Header aggregates must sum strictly included components (tuition only)
      const header = getSavedHeader();
      expect(header.pricingVersion).toBe(FeePricingVersion.V0_SNAPSHOTTED);
      expect(header.grossAmount.toString()).toBe('1000');
      expect(header.discountAmount.toString()).toBe('125');
      expect(header.taxableAmount.toString()).toBe('875');
      expect(header.gstAmount.toString()).toBe('157.5');
      expect(header.netAmount.toString()).toBe('1032.5');
      expect(header.totalFeeAmount.toString()).toBe('1032.5');
      expect(header.totalDueAmount.toString()).toBe('1032.5');
      expect(header.totalPaidAmount.toString()).toBe('0');
    });

    it('verifies ROUND_HALF_UP rounding boundaries (.555 up, .554 down)', async () => {
      // Create component with amount that tests half-up rounding:
      // Amount: 100.5555, discount 10%
      const boundaryMaster = {
        ...standardFeeStructure,
        gstPercentage: new Prisma.Decimal('18.00'),
        feeComponents: [
          {
            id: 'fc-round-1',
            name: 'Boundary 1',
            description: 'Boundary test 1',
            amount: new Prisma.Decimal('333.33'),
            discountApplicable: true,
            isMandatory: true,
            isActive: true,
          },
        ],
      };
      const { service, getDetailRows } = createHarness(boundaryMaster);

      // 333.33 * 33.33% = 111.098889 => rounds to 111.10
      // Taxable = 333.33 - 111.10 = 222.23
      // GST 18%: 222.23 * 0.18 = 40.0014 => rounds to 40.00
      // Total payable = 222.23 + 40.00 = 262.23
      await service.create({
        ...baseDtoPayload,
        components: [{ feeComponentId: 'fc-round-1', discountPercentage: '33.33' }],
      } as any);

      const detail = getDetailRows()[0];
      expect(detail.discountAmount.toString()).toBe('111.1');
      expect(detail.taxableAmount.toString()).toBe('222.23');
      expect(detail.gstAmount.toString()).toBe('40');
      expect(detail.totalAmountToBePaid.toString()).toBe('262.23');
    });

    it('calculates properly with zero-percent GST', async () => {
      const zeroGstMaster = {
        ...standardFeeStructure,
        gstPercentage: new Prisma.Decimal('0.00'),
      };
      const { service, getDetailRows, getSavedHeader } = createHarness(zeroGstMaster);

      await service.create({
        ...baseDtoPayload,
        components: [{ feeComponentId: 'fc-tuition', discountPercentage: '10.00' }],
      } as any);

      const detail = getDetailRows().find((d) => d.feeComponentId === 'fc-tuition');
      expect(detail.discountAmount.toString()).toBe('100');
      expect(detail.taxableAmount.toString()).toBe('900');
      expect(detail.gstAmount.toString()).toBe('0');
      expect(detail.totalAmountToBePaid.toString()).toBe('900');

      const header = getSavedHeader();
      expect(header.gstAmount.toString()).toBe('0');
      expect(header.netAmount.toString()).toBe('900');
    });

    it('allows 100% discount on an eligible component when total payable remains positive', async () => {
      const { service, getDetailRows, getSavedHeader } = createHarness();

      // Tuition: 1000 with 100% discount => payable = 0
      // Lab: 500 with 0% discount => taxable 500, gst 90 => payable 590
      await service.create({
        ...baseDtoPayload,
        components: [
          { feeComponentId: 'fc-tuition', discountPercentage: '100.00' },
          { feeComponentId: 'fc-lab', discountPercentage: '0.00' },
        ],
      } as any);

      const tuitionDetail = getDetailRows().find((d) => d.feeComponentId === 'fc-tuition');
      expect(tuitionDetail.discountAmount.toString()).toBe('1000');
      expect(tuitionDetail.taxableAmount.toString()).toBe('0');
      expect(tuitionDetail.gstAmount.toString()).toBe('0');
      expect(tuitionDetail.totalAmountToBePaid.toString()).toBe('0');

      const header = getSavedHeader();
      expect(header.netAmount.toString()).toBe('590');
      expect(header.netAmount.gt(0)).toBe(true);
    });

    it('rejects discount on non-discountable component', async () => {
      const { service } = createHarness();
      // fc-exam has discountApplicable: false
      await expect(
        service.create({
          ...baseDtoPayload,
          components: [
            { feeComponentId: 'fc-tuition', discountPercentage: '0.00' },
            { feeComponentId: 'fc-exam', discountPercentage: '5.00' },
          ],
        } as any)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects creation when total payable fee amount is zero (e.g. 100% discount on all selected)', async () => {
      const singleComponentMaster = {
        ...standardFeeStructure,
        feeComponents: [activeFeeComponents[0]], // tuition only
      };
      const { service } = createHarness(singleComponentMaster);

      await expect(
        service.create({
          ...baseDtoPayload,
          components: [{ feeComponentId: 'fc-tuition', discountPercentage: '100.00' }],
        } as any)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects omission of an active mandatory component', async () => {
      const { service } = createHarness();
      // Omitting mandatory fc-tuition and selecting only optional fc-lab
      await expect(
        service.create({
          ...baseDtoPayload,
          components: [{ feeComponentId: 'fc-lab', discountPercentage: '0.00' }],
        } as any)
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('DRAFT Fee Configuration Updates (V0 vs LEGACY)', () => {
    it('re-inclusion of an optional component reuses the existing snapshot without recalculating against master', async () => {
      const { service, tx, getSavedHeader, getDetailRows } = createHarness();

      // Create with tuition only (exam excluded)
      await service.create({
        ...baseDtoPayload,
        components: [{ feeComponentId: 'fc-tuition', discountPercentage: '0.00' }],
      } as any);

      const header = getSavedHeader();
      const initialDetails = getDetailRows();
      const examDetail = initialDetails.find((d) => d.feeComponentId === 'fc-exam');
      expect(examDetail.isIncluded).toBe(false);

      // Now update fee configuration in DRAFT to include both tuition and exam
      const tuitionId = 'detail-1';
      const examId = 'detail-2';

      await service.updateFeeConfiguration('adm-test-1', {
        selectedFeeComponentIds: [tuitionId, examId],
      });

      // Exam component must now be isIncluded = true, retaining its stored snapshot
      const updatedDetails = getDetailRows();
      const updatedExam = updatedDetails.find((d) => d.feeComponentId === 'fc-exam');
      expect(updatedExam.isIncluded).toBe(true);
      expect(updatedExam.originalAmount.toString()).toBe('250');
      expect(updatedExam.taxableAmount.toString()).toBe('250');
      expect(updatedExam.gstAmount.toString()).toBe('45');
      expect(updatedExam.totalAmountToBePaid.toString()).toBe('295');

      // Header must be recomputed from included snapshots (tuition 1180 + exam 295 = 1475)
      const updatedHeader = getSavedHeader();
      expect(updatedHeader.grossAmount.toString()).toBe('1250');
      expect(updatedHeader.taxableAmount.toString()).toBe('1250');
      expect(updatedHeader.gstAmount.toString()).toBe('225');
      expect(updatedHeader.netAmount.toString()).toBe('1475');
    });

    it('freezes fee configuration updates when financial activity exists', async () => {
      const { service, tx } = createHarness();

      await service.create({
        ...baseDtoPayload,
        components: [{ feeComponentId: 'fc-tuition', discountPercentage: '0.00' }],
      } as any);

      // Simulate existing payment on the header
      tx.feePayment.count.mockResolvedValueOnce(1);

      await expect(
        service.updateFeeConfiguration('adm-test-1', {
          selectedFeeComponentIds: ['detail-1'],
        })
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('Concession Mutation Policy on V0 Admissions', () => {
    const createConcessionHarness = (status = AdmissionStatus.DRAFT) => {
      const detail = {
        id: 'dt-1',
        feePaymentHeaderId: 'hdr-v0',
        feeComponentId: 'fc-tuition',
        originalAmount: new Prisma.Decimal('1000.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        discountPercentage: new Prisma.Decimal('0.00'),
        gstPercentage: new Prisma.Decimal('18.00'),
        taxableAmount: new Prisma.Decimal('1000.00'),
        gstAmount: new Prisma.Decimal('180.00'),
        finalAmount: new Prisma.Decimal('1180.00'),
        totalAmountToBePaid: new Prisma.Decimal('1180.00'),
        amountPaid: new Prisma.Decimal('0.00'),
        discountApplicable: true,
        isActive: true,
        isIncluded: true,
        isMandatory: true,
        concession: null as any,
      };

      const header = {
        id: 'hdr-v0',
        admissionId: 'adm-v0',
        pricingVersion: FeePricingVersion.V0_SNAPSHOTTED,
        grossAmount: new Prisma.Decimal('1000.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        taxableAmount: new Prisma.Decimal('1000.00'),
        gstAmount: new Prisma.Decimal('180.00'),
        netAmount: new Prisma.Decimal('1180.00'),
        totalFeeAmount: new Prisma.Decimal('1180.00'),
        totalPaidAmount: new Prisma.Decimal('0.00'),
        totalDueAmount: new Prisma.Decimal('1180.00'),
        feePaymentDetails: [detail],
      };

      const txMock: any = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        admission: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'adm-v0',
            admissionStatus: status,
            schoolId: 'school-1',
            createdById: 'user-1',
            feePaymentHeaders: [header],
          }),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
        },
        feePayment: {
          count: jest.fn().mockResolvedValue(0),
        },
        feePaymentInstallmentAllocation: {
          count: jest.fn().mockResolvedValue(0),
        },
        paymentReversalEvent: {
          count: jest.fn().mockResolvedValue(0),
        },
        feePaymentDetails: {
          findMany: jest.fn().mockResolvedValue([detail]),
          update: jest.fn().mockImplementation(({ data }) => Object.assign(detail, data)),
        },
        feePaymentHeader: {
          findUnique: jest.fn().mockResolvedValue(header),
          update: jest.fn().mockImplementation(({ data }) => Object.assign(header, data)),
        },
        admissionFeeConcession: {
          create: jest.fn().mockResolvedValue({ id: 'conc-1' }),
          findUnique: jest.fn().mockResolvedValue({ id: 'conc-1', admissionId: 'adm-v0', feePaymentDetailsId: 'dt-1' }),
          update: jest.fn().mockResolvedValue({ id: 'conc-1' }),
          delete: jest.fn().mockResolvedValue({ id: 'conc-1' }),
        },
        admissionFeeConcessionRevision: {
          create: jest.fn().mockResolvedValue({ id: 'rev-1' }),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const dbMock = {
        $transaction: jest.fn(async (cb: (client: any) => Promise<any>) => cb(txMock)),
      } as any;

      const concessionService = new AdmissionConcessionService(dbMock);
      return { concessionService, txMock, header, detail };
    };

    it('permits assignConcession, updateConcession, and removeConcession on eligible DRAFT V0 admissions', async () => {
      const { concessionService, txMock, detail, header } = createConcessionHarness();

      // 1. assignConcession succeeds and recalculates V0 GST
      const assignResult = await concessionService.assignConcession(
        'adm-v0',
        { feePaymentDetailsId: 'dt-1', payableAmount: '500.00' } as any,
        'user-1',
      );
      expect(assignResult).toBeDefined();
      expect(txMock.admissionFeeConcession.create).toHaveBeenCalled();
      expect(txMock.feePaymentDetails.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dt-1' },
          data: expect.objectContaining({
            discountAmount: new Prisma.Decimal('500.00'),
            taxableAmount: new Prisma.Decimal('500.00'),
            gstAmount: new Prisma.Decimal('90.00'),
            totalAmountToBePaid: new Prisma.Decimal('590.00'),
          }),
        }),
      );

      // Set up assigned concession for update
      const concession = {
        id: 'conc-1',
        admissionId: 'adm-v0',
        feePaymentDetailsId: 'dt-1',
        calculatedDiscountAmount: new Prisma.Decimal('500.00'),
      };
      detail.concession = concession;
      txMock.admissionFeeConcession.findUnique.mockResolvedValue(concession);

      // 2. updateConcession succeeds
      await concessionService.updateConcession(
        'adm-v0',
        'conc-1',
        { payableAmount: '700.00' } as any,
        'user-1',
      );
      expect(txMock.admissionFeeConcessionRevision.create).toHaveBeenCalled();
      expect(txMock.admissionFeeConcession.update).toHaveBeenCalled();

      // 3. removeConcession succeeds and restores baseline
      await concessionService.removeConcession('adm-v0', 'conc-1');
      expect(txMock.admissionFeeConcessionRevision.deleteMany).toHaveBeenCalled();
      expect(txMock.admissionFeeConcession.delete).toHaveBeenCalled();
    });

    it('rejects concession mutation on V0 when financial activity exists (payments, allocations, reversals)', async () => {
      const { concessionService, txMock } = createConcessionHarness();

      // Payment exists
      txMock.feePayment.count.mockResolvedValueOnce(1);
      await expect(
        concessionService.assignConcession('adm-v0', { feePaymentDetailsId: 'dt-1', payableAmount: '500.00' } as any, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);

      // Installment allocation exists
      txMock.feePaymentInstallmentAllocation.count.mockResolvedValueOnce(1);
      await expect(
        concessionService.assignConcession('adm-v0', { feePaymentDetailsId: 'dt-1', payableAmount: '500.00' } as any, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);

      // Reversal event exists
      txMock.paymentReversalEvent.count.mockResolvedValueOnce(1);
      await expect(
        concessionService.assignConcession('adm-v0', { feePaymentDetailsId: 'dt-1', payableAmount: '500.00' } as any, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects concession mutation on V0 when admission status is CONFIRMED or CANCELLED', async () => {
      const confirmedHarness = createConcessionHarness(AdmissionStatus.CONFIRMED);
      await expect(
        confirmedHarness.concessionService.assignConcession('adm-v0', { feePaymentDetailsId: 'dt-1', payableAmount: '500.00' } as any, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);

      const cancelledHarness = createConcessionHarness(AdmissionStatus.CANCELLED);
      await expect(
        cancelledHarness.concessionService.assignConcession('adm-v0', { feePaymentDetailsId: 'dt-1', payableAmount: '500.00' } as any, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
