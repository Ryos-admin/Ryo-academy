import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard.js';
import { AuthorizationService } from './authorization.service.js';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS } from './permissions/permission.constants.js';

function contextFor(required: string[], user: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as never;
}

function build(required: string[], granted: string[]) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
  const authz = {
    getPermissionNamesForUser: jest.fn().mockResolvedValue(granted),
  } as unknown as AuthorizationService;
  return new PermissionsGuard(reflector, authz);
}

describe('PermissionsGuard for attendance routes', () => {
  it('allows a COLLEGE_ADMIN that holds ATTENDANCE_READ', async () => {
    const guard = build([PERMISSIONS.ATTENDANCE_READ], [
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_MARK,
    ]);
    await expect(
      guard.canActivate(contextFor([PERMISSIONS.ATTENDANCE_READ], { userId: 'admin-1' })),
    ).resolves.toBe(true);
  });

  it('rejects an OFFICE_ADMIN that lacks ATTENDANCE_READ', async () => {
    const guard = build([PERMISSIONS.ATTENDANCE_READ], [
      PERMISSIONS.FEES_READ,
      PERMISSIONS.STUDENT_READ,
    ]);
    await expect(
      guard.canActivate(contextFor([PERMISSIONS.ATTENDANCE_READ], { userId: 'office-1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a STAFF that holds ATTENDANCE_READ', async () => {
    const guard = build([PERMISSIONS.ATTENDANCE_READ], [
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_MARK,
      PERMISSIONS.ATTENDANCE_UPDATE,
    ]);
    await expect(
      guard.canActivate(contextFor([PERMISSIONS.ATTENDANCE_READ], { userId: 'staff-1' })),
    ).resolves.toBe(true);
  });

  it('rejects an unauthenticated request before any permission check', async () => {
    const guard = build([PERMISSIONS.ATTENDANCE_READ], []);
    await expect(
      guard.canActivate(contextFor([PERMISSIONS.ATTENDANCE_READ], undefined)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
