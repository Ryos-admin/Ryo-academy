import { FeeStructureSyncController } from './fee-structure-sync.controller.js';

describe('FeeStructureSyncController', () => {
  let controller: FeeStructureSyncController;
  let mockSyncService: any;

  beforeEach(() => {
    mockSyncService = {
      executeSynchronization: jest.fn().mockResolvedValue({
        feeStructureId: 'fs-1',
        synchronizedAdmissionCount: 3,
      }),
    };

    controller = new FeeStructureSyncController(mockSyncService);
  });

  it('delegates synchronization execution with authenticated user context', async () => {
    const req = {
      user: {
        userId: 'usr-admin-1',
        schoolId: 'sch-alpha-1',
      },
    };

    const dto = {
      supplementaryDueDate: '2027-01-31',
    };

    const res = await controller.sync('fs-1', dto, req);

    expect(mockSyncService.executeSynchronization).toHaveBeenCalledWith(
      'fs-1',
      dto,
      'usr-admin-1',
      'sch-alpha-1',
    );
    expect(res).toEqual({
      feeStructureId: 'fs-1',
      synchronizedAdmissionCount: 3,
    });
  });
});
