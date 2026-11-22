import { Prisma } from '../../../generated/prisma/client.js';

// DECIMAL(65,2) values need 65 significant digits; extra precision protects sums.
Prisma.Decimal.set({ precision: 100, toExpNeg: -1000, toExpPos: 1000 });
