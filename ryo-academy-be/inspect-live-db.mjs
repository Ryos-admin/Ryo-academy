import { PrismaClient } from './generated/prisma/client.js';

const prisma = new PrismaClient();
await prisma.$connect();
const [schools, academicYears, programs, classes, sections, feeStructures, feeComponents, admissions] = await Promise.all([
  prisma.school.findMany({ select: { id: true, schoolCode: true } }),
  prisma.academicYear.findMany({ select: { id: true, name: true } }),
  prisma.program.findMany({ select: { id: true, name: true, academicYearId: true } }),
  prisma.class.findMany({ select: { id: true, name: true, programId: true } }),
  prisma.section.findMany({ select: { id: true, name: true, classId: true } }),
  prisma.feeStructure.findMany({ select: { id: true, name: true, academicYearId: true, programId: true, classId: true, totalAmount: true, isActive: true } }),
  prisma.feeComponent.findMany({ select: { id: true, name: true, feeStructureId: true, amount: true, isActive: true } }),
  prisma.admission.findMany({ select: { id: true, admissionNumber: true, schoolId: true, academicYearId: true, programId: true, classId: true, sectionId: true } }),
]);
console.log(JSON.stringify({ schools, academicYears, programs, classes, sections, feeStructures, feeComponents, admissions }, null, 2));
await prisma.$disconnect();
