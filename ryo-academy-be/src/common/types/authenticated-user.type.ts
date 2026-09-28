export interface AuthenticatedUser {
  /**
   * Identifier of the authenticated user, taken from the `sub` claim of the JWT.
   */
  userId: string;
}

export interface AuthorizedUser {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  roles: [
    {
      id: string;
      name: string;
    },
  ];
  permissions: object;
  staff: {
    id: string;
    staffCode: string;
    status: boolean;
  };
}
