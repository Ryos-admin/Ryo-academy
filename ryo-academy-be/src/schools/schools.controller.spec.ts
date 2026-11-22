import { SchoolsController } from './schools.controller.js';
import { SchoolsService } from './schools.service.js';
import { UpdateSchoolConfigurationDto } from './dto/update-school-configuration.dto.js';
import { SchoolConfigurationResponseDto } from './dto/school-configuration-response.dto.js';

describe('SchoolsController', () => {
  let controller: SchoolsController;
  let service: {
    resolveActiveSchool: jest.Mock;
    getConfiguration: jest.Mock;
    updateConfiguration: jest.Mock;
  };

  beforeEach(() => {
    service = {
      resolveActiveSchool: jest.fn(),
      getConfiguration: jest.fn(),
      updateConfiguration: jest.fn(),
    };
    controller = new SchoolsController(service as unknown as SchoolsService);
  });

  describe('getConfiguration', () => {
    it('resolves active school from current user and calls getConfiguration', async () => {
      const mockResponse: SchoolConfigurationResponseDto = {
        schoolId: 'school-1',
        schoolName: 'Ryo Academy',
        schoolCode: 'RYO',
        activeAcademicYearId: 'ay-1',
        activeAcademicYear: {
          id: 'ay-1',
          name: 'AY 2026-27',
          startDate: new Date('2026-06-01'),
          endDate: new Date('2027-05-31'),
          isActive: true,
        },
        isConfigured: true,
        isInvalid: false,
      };

      service.resolveActiveSchool.mockResolvedValue('school-1');
      service.getConfiguration.mockResolvedValue(mockResponse);

      const res = await controller.getConfiguration({ userId: 'u-1' });

      expect(service.resolveActiveSchool).toHaveBeenCalledWith('u-1');
      expect(service.getConfiguration).toHaveBeenCalledWith('school-1');
      expect(res).toEqual(mockResponse);
    });
  });

  describe('updateConfiguration', () => {
    it('resolves active school from current user and calls updateConfiguration with DTO', async () => {
      const dto: UpdateSchoolConfigurationDto = {
        activeAcademicYearId: 'ay-2',
      };
      const mockResponse: SchoolConfigurationResponseDto = {
        schoolId: 'school-1',
        schoolName: 'Ryo Academy',
        schoolCode: 'RYO',
        activeAcademicYearId: 'ay-2',
        activeAcademicYear: {
          id: 'ay-2',
          name: 'AY 2027-28',
          startDate: new Date('2027-06-01'),
          endDate: new Date('2028-05-31'),
          isActive: true,
        },
        isConfigured: true,
        isInvalid: false,
      };

      service.resolveActiveSchool.mockResolvedValue('school-1');
      service.updateConfiguration.mockResolvedValue(mockResponse);

      const res = await controller.updateConfiguration({ userId: 'u-1' }, dto);

      expect(service.resolveActiveSchool).toHaveBeenCalledWith('u-1');
      expect(service.updateConfiguration).toHaveBeenCalledWith('school-1', dto);
      expect(res).toEqual(mockResponse);
    });
  });
});
