# Frontend API client

Set `VITE_API_BASE_URL` to the complete backend API base URL, including its configured global prefix (for example, `/api/v1`). Do not commit real environment files or secrets.

The transport client is available from `src/lib/api-client.ts`:

```ts
apiClient.get<ResponseType>("/resource", { token });
apiClient.post<ResponseType>("/resource", requestBody, { token });
```

The optional `token` is supplied by future authentication code; the client does not persist or discover tokens itself. Failed responses throw `ApiError`, which preserves the HTTP status, backend `message`, backend `error`, and the original response body. String and validation-array messages are both supported.

The client is intended to be called directly from React Query `queryFn` and `mutationFn` functions. React Query remains responsible for caching and invalidation.
