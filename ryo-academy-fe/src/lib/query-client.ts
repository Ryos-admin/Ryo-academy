import { QueryClient } from "@tanstack/react-query";

/**
 * The single QueryClient for the app.
 *
 * It lives here rather than in the router module so that page modules can reach
 * it without importing the router (which imports them in turn).
 */
export const queryClient = new QueryClient();
