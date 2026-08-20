export interface AuthenticatedUser {
  /**
   * Identifier of the authenticated user, taken from the `sub` claim of the JWT.
   */
  userId: string;
}
