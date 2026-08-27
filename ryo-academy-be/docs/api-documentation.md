# Ryo Academy API Documentation

## Overview

This document describes the HTTP API exposed by the Ryo Academy backend.

- Base URL: `http://localhost:3000`
- API prefix: controlled by `API_PREFIX` and `API_VERSION` in `src/main.ts`
- Content type for JSON requests: `application/json`
- IDs are normally UUID strings.
- Dates are sent as ISO-8601 strings, for example `2027-06-01T00:00:00.000Z`.
- Examples use placeholder IDs such as `academic-year-uuid`.

The application uses a global `ValidationPipe` with transformation, whitelisting, and rejection of unknown properties. Validation failures normally return `400 Bad Request`.

## Authentication

Send the access token with protected requests:

```http
Authorization: Bearer <access-token>
```

The API uses JWT authentication. Invalid or missing credentials normally return:

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### Important current behavior

`AuthController` has a class-level `JwtAuthGuard`. Therefore, in the current implementation, `POST /auth/register` and `POST /auth/login` are also guarded and may require an existing bearer token. Remove the class-level guard or apply it only to `GET /auth/me` if registration and login are intended to be public.

## Common error responses

Validation errors use the NestJS error format, for example:

```json
{
  "statusCode": 400,
  "message": ["email must be an email", "password must be longer than or equal to 12 characters"],
  "error": "Bad Request"
}
```

Other common responses:

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

```json
{
  "statusCode": 403,
  "message": "Forbidden"
}
```

```json
{
  "statusCode": 404,
  "message": "Resource not found"
}
```

## Root

### GET `/`

Returns the application greeting. This route is not protected.

Response `200 OK`:

```text
Hello World!!!
```

## Authentication endpoints

### POST `/auth/register`

Registers a user. Email is normalized to lowercase and trimmed. Password must contain at least 12 characters.

Request body:

```json
{
  "email": "admin@ryoacademy.com",
  "password": "strong-password-123",
  "firstName": "Ryo",
  "lastName": "Admin"
}
```

Response `201 Created`:

```json
{
  "id": "user-uuid",
  "email": "admin@ryoacademy.com",
  "firstName": "Ryo",
  "lastName": "Admin",
  "isActive": true,
  "createdAt": "2026-08-28T12:00:00.000Z"
}
```

### POST `/auth/login`

Authenticates an active user.

Request body:

```json
{
  "email": "admin@ryoacademy.com",
  "password": "DevTestPassword123!"
}
```

Response `200 OK`:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Invalid credentials return `401 Unauthorized` with `Invalid email or password.`.

### GET `/auth/me`

Returns the authenticated user claims. Requires a JWT.

Response `200 OK`:

```json
{
  "userId": "user-uuid"
}
```

## Protected and permission checks

All routes in this section require a JWT.

### GET `/protected/me`

Returns the current authenticated user claims.

Response `200 OK`:

```json
{
  "userId": "user-uuid"
}
```

### GET `/protected/students`

Requires `student:read`.

Response `200 OK`:

```json
{
  "message": "Students endpoint accessed",
  "userId": "user-uuid"
}
```

### GET `/protected/students/create`

Requires `student:create`.

Response `200 OK`:

```json
{
  "message": "Student create endpoint accessed",
  "userId": "user-uuid"
}
```

### GET `/protected/students/update`

Requires `student:update`.

Response `200 OK`:

```json
{
  "message": "Student update endpoint accessed",
  "userId": "user-uuid"
}
```

### GET `/protected/students/multi`

Requires both `student:read` and `student:update`.

Response `200 OK`:

```json
{
  "message": "Multi-permission endpoint accessed",
  "userId": "user-uuid"
}
```

## Academic years

### POST `/academic-years`

Creates an academic year. `schoolId` is immutable after creation.

Request body:

```json
{
  "schoolId": "school-uuid",
  "name": "2027-28",
  "startDate": "2027-06-01T00:00:00.000Z",
  "endDate": "2028-05-31T00:00:00.000Z"
}
```

Response `201 Created`:

```json
{
  "id": "academic-year-uuid",
  "schoolId": "school-uuid",
  "name": "2027-28",
  "startDate": "2027-06-01T00:00:00.000Z",
  "endDate": "2028-05-31T00:00:00.000Z",
  "isActive": true,
  "createdAt": "2026-08-28T12:00:00.000Z",
  "updatedAt": "2026-08-28T12:00:00.000Z"
}
```

### GET `/academic-years`

Lists academic years, ordered by `schoolCode` ascending and `startDate` descending.

Response `200 OK`:

```json
[
  {
    "id": "academic-year-uuid",
    "schoolId": "school-uuid",
    "name": "2027-28",
    "startDate": "2027-06-01T00:00:00.000Z",
    "endDate": "2028-05-31T00:00:00.000Z",
    "isActive": true
  }
]
```

### GET `/academic-years/:id`

Returns one academic year. `:id` is the academic-year UUID.

Response `200 OK`:

```json
{
  "id": "academic-year-uuid",
  "schoolId": "school-uuid",
  "name": "2027-28",
  "startDate": "2027-06-01T00:00:00.000Z",
  "endDate": "2028-05-31T00:00:00.000Z",
  "isActive": true
}
```

### PATCH `/academic-years/:id`

Partially updates an academic year. `schoolId` cannot be changed.

Request body:

```json
{
  "name": "2027-2028",
  "endDate": "2028-05-31T00:00:00.000Z"
}
```

Response `200 OK`: the updated academic-year object.

## Programs

### GET `/programs`

Lists programs or shifts.

Response `200 OK`:

```json
[
  {
    "id": "program-uuid",
    "name": "Day-Care",
    "academicYearId": "academic-year-uuid",
    "isPrimary": true,
    "daysOfWeek": ["MON", "TUE", "WED", "THU", "FRI"],
    "startTime": "08:00",
    "endTime": "17:00",
    "isActive": true
  }
]
```

### POST `/programs`

Creates a program or shift.

Request body:

```json
{
  "name": "Day-Care",
  "academicYear": "academic-year-uuid",
  "isPrimary": true,
  "daysOfWeek": ["MON", "TUE", "WED", "THU", "FRI"],
  "startTime": "08:00",
  "endTime": "17:00"
}
```

Response `201 Created`: the created program object.

### GET `/programs/:id`

Returns one program.

Response `200 OK`: the program object.

### PATCH `/programs/:id`

Updates a program.

Request body:

```json
{
  "name": "Morning Shift",
  "isPrimary": false,
  "daysOfWeek": ["MON", "TUE", "WED", "THU", "FRI"],
  "startTime": "08:30",
  "endTime": "13:00"
}
```

Response `200 OK`: the updated program object.

## Classes

### GET `/classes`

Response `200 OK`:

```json
[
  {
    "id": "class-uuid",
    "name": "Class 1",
    "programId": "program-uuid",
    "isActive": true
  }
]
```

### GET `/classes/:id`

Returns one class. `:id` is the class UUID.

Response `200 OK`: the class object.

### POST `/classes`

Request body:

```json
{
  "name": "Class 1",
  "programId": "program-uuid"
}
```

Response `201 Created`: the created class object.

### PATCH `/classes/:id`

Request body:

```json
{
  "name": "Class 1A"
}
```

Response `200 OK`: the updated class object.

## Sections

### GET `/sections`

Lists all sections.

Response `200 OK`:

```json
[
  {
    "id": "section-uuid",
    "name": "A",
    "classId": "class-uuid",
    "isActive": true
  }
]
```

### GET `/sections/:classId`

Lists sections belonging to a class.

Response `200 OK`: an array of section objects.

### POST `/sections`

Request body:

```json
{
  "name": "A",
  "classId": "class-uuid"
}
```

Response `201 Created`: the created section object.

### PATCH `/sections/:id`

Request body:

```json
{
  "name": "B"
}
```

Response `200 OK`: the updated section object.

## Fee structures

### GET `/fee-structure-master`

Lists fee structures ordered by academic year and name.

Response `200 OK`:

```json
[
  {
    "id": "fee-structure-uuid",
    "name": "Standard Fee Structure",
    "description": "Standard fees for Class 1",
    "academicYearId": "academic-year-uuid",
    "programId": "program-uuid",
    "classId": "class-uuid",
    "totalAmount": 10000,
    "isActive": true
  }
]
```

### GET `/fee-structure-master/:id`

Returns one fee structure. `:id` is the fee-structure UUID.

Response `200 OK`: the fee-structure object.

### POST `/fee-structure-master`

Creates a fee structure and its fee components in one transaction.

Request body:

```json
{
  "name": "Standard Fee Structure",
  "description": "Standard fees for Class 1",
  "academicYearId": "academic-year-uuid",
  "programId": "program-uuid",
  "classId": "class-uuid",
  "totalAmount": "10000",
  "feeComponents": [
    {
      "name": "Tuition Fee",
      "description": "Annual tuition",
      "amount": 7000,
      "discountApplicable": true
    },
    {
      "name": "Library Fee",
      "description": "Library access",
      "amount": 3000,
      "discountApplicable": false
    }
  ]
}
```

Response `201 Created`:

```json
{
  "errorMessage": "Fee structure created successfully"
}
```

### DELETE `/fee-structure-master/:id`

Marks the fee structure active in the current service implementation. Despite the HTTP method, this does not currently remove the record.

Response `200 OK`:

```json
{
  "id": "fee-structure-uuid",
  "isActive": true
}
```

## Fee components

### GET `/fee-structure-child`

Response `200 OK`:

```json
[
  {
    "id": "fee-component-uuid",
    "name": "Tuition Fee",
    "description": "Annual tuition",
    "amount": 7000,
    "feeStructureId": "fee-structure-uuid",
    "discountApplicable": true,
    "isMandatory": true
  }
]
```

### GET `/fee-structure-child/:id`

Returns one fee component.

Response `200 OK`: the fee-component object.

### POST `/fee-structure-child`

Request body:

```json
{
  "name": "Tuition Fee",
  "description": "Annual tuition",
  "amount": 7000,
  "feeStructureId": "fee-structure-uuid",
  "discountApplicable": true,
  "isMandatory": true
}
```

Response `201 Created`: the created fee-component object.

### PUT `/fee-structure-child/:id`

Request body:

```json
{
  "name": "Tuition Fee",
  "description": "Updated annual tuition",
  "amount": 7500,
  "discountApplicable": true,
  "isMandatory": true
}
```

Response `200 OK`: the updated fee-component object.

### DELETE `/fee-structure-child/:id`

Deletes a fee component.

Response `200 OK`: the deleted fee-component object.

## Admissions

### GET `/admission`

Lists admissions.

Response `200 OK`:

```json
[
  {
    "id": "admission-uuid",
    "admissionNumber": "ADM-2027-001",
    "admissionSequence": 1,
    "schoolId": "school-uuid",
    "academicYearId": "academic-year-uuid",
    "programId": "program-uuid",
    "classId": "class-uuid",
    "studentName": "John Doe",
    "gender": "MALE",
    "dateOfBirth": "2015-05-15T00:00:00.000Z",
    "parentName": "Jane Doe",
    "parentRelation": "MOTHER",
    "parentPhone": "+1 202 555 0100",
    "parentAlternatePhone": "+1 202 555 0101",
    "parentEmail": "jane@example.com",
    "addressLine1": "123 Main Street",
    "addressLine2": "Apt 4B",
    "city": "Springfield",
    "state": "Illinois",
    "country": "USA",
    "pincode": "62704",
    "admissionStatus": "PENDING",
    "createdById": "user-uuid"
  }
]
```

### GET `/admission/:id`

Returns one admission. `:id` is the admission UUID.

Response `200 OK`: the admission object.

### POST `/admission`

Creates an admission and initializes its fee-payment header and details. The service generates `admissionNumber`, `admissionSequence`, and `schoolId`; supplied values for these generated fields may be replaced.

Request body:

```json
{
  "schoolId": "school-uuid",
  "academicYearId": "academic-year-uuid",
  "programId": "program-uuid",
  "classId": "class-uuid",
  "studentName": "John Doe",
  "gender": "MALE",
  "dateOfBirth": "2015-05-15T00:00:00.000Z",
  "parentName": "Jane Doe",
  "parentRelation": "MOTHER",
  "parentPhone": "+1 202 555 0100",
  "parentAlternatePhone": "+1 202 555 0101",
  "parentEmail": "jane@example.com",
  "addressLine1": "123 Main Street",
  "addressLine2": "Apt 4B",
  "city": "Springfield",
  "state": "Illinois",
  "country": "USA",
  "postalCode": "62704",
  "createdById": "user-uuid",
  "feePaymentHeaders": {
    "admissionId": "admission-uuid",
    "studentId": "student-uuid",
    "academicYearId": "academic-year-uuid",
    "programId": "program-uuid",
    "classId": "class-uuid",
    "feeStructureId": "fee-structure-uuid",
    "grossAmount": 10000,
    "discountAmount": 0,
    "netAmount": 10000,
    "totalPaidAmount": 0,
    "totalDueAmount": 10000,
    "totalFeeAmount": 10000,
    "feePaymentDetails": []
  }
}
```

Response `200 OK`: the created admission object. The current service transaction does not explicitly return the created value, so the response may be empty depending on the runtime path.

### PATCH `/admission/:id`

Updates admission details and fee-payment information.

Request body:

```json
{
  "admissionId": "admission-uuid",
  "programId": "program-uuid",
  "classId": "class-uuid",
  "studentName": "John Doe",
  "gender": "MALE",
  "dateOfBirth": "2015-05-15T00:00:00.000Z",
  "parentName": "Jane Doe",
  "parentRelation": "MOTHER",
  "parentPhone": "+1 202 555 0100",
  "parentAlternatePhone": "+1 202 555 0101",
  "parentEmail": "jane@example.com",
  "addressLine1": "123 Main Street",
  "addressLine2": "Apt 4B",
  "city": "Springfield",
  "state": "Illinois",
  "country": "USA",
  "postalCode": "62704",
  "feePaymentHeaders": {
    "id": "fee-payment-header-uuid",
    "academicYearId": "academic-year-uuid",
    "admissionId": "admission-uuid",
    "feeStructureId": "fee-structure-uuid",
    "grossAmount": 10000,
    "discountAmount": 0,
    "netAmount": 10000,
    "totalPaidAmount": 2500,
    "totalDueAmount": 7500,
    "totalFeeAmount": 10000,
    "feePaymentDetails": []
  }
}
```

Response `200 OK`:

```json
{
  "id": "admission-uuid",
  "studentName": "John Doe",
  "programId": "program-uuid",
  "classId": "class-uuid",
  "feePaymentHeaders": {
    "id": "fee-payment-header-uuid",
    "totalPaidAmount": 2500,
    "totalDueAmount": 7500
  }
}
```

### POST `/admission/:id/confirmed`

Changes the admission status to `CONFIRMED`.

Response `200 OK`: the updated admission object.

### POST `/admission/:id/cancelled`

Changes the admission status to `CANCELLED`.

Response `200 OK`: the updated admission object.

## Permission names

The permission constants currently defined by the application are:

```text
admission:read       admission:create       admission:update
fees:read            fees:create            fees:update
class:read           class:create           class:update
attendance:read      attendance:mark        attendance:update
staff:read           staff:create           staff:update
student:read         student:create         student:update
shift:read           shift:create           shift:update
timetable:read
```

Only the `/protected/students*` demonstration routes currently enforce permissions in their controllers. The academic, admission, and fee controllers currently do not declare JWT or permission guards.
