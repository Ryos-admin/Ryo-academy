import { FeeManagementController } from './fee-management.controller.js';
import { FeeManagementService } from './fee-management.service.js';
import { QueryFeeDashboardDto } from './dto/query-fee-dashboard.dto.js';
import { FeeDashboardResponseDto } from './dto/fee-dashboard-response.dto.js';

describe('FeeManagementController', () => {
  let controller: FeeManagementController;
  let service: {
    getDashboard: jest.Mock;
  };

  beforeEach(() => {
    service = {
      getDashboard: jest.fn(),
    };
    controller = new FeeManagementController(
      service as unknown as FeeManagementService,
    );
  });

  describe('getDashboard', () => {
    it('delegates to feeManagementService.getDashboard with user.userId and query dto', async () => {
      const mockQuery: QueryFeeDashboardDto = {
        page: 2,
        pageSize: 10,
        search: 'Alice',
        classId: 'c-1',
        programId: 'p-1',
      };

      const mockResponse: FeeDashboardResponseDto = {
        configured: true,
        invalidConfiguration: false,
        activeAcademicYear: {
          id: 'ay-1',
          name: 'AY 2026-27',
          startDate: new Date('2026-06-01'),
          endDate: new Date('2027-05-31'),
        },
        data: [],
        page: 2,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      };

      service.getDashboard.mockResolvedValue(mockResponse);

      const res = await controller.getDashboard({ userId: 'user-123' }, mockQuery);

      expect(service.getDashboard).toHaveBeenCalledWith('user-123', mockQuery);
      expect(res).toEqual(mockResponse);
    });
  });
});
