import { twMerge } from 'tailwind-merge';

import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function transformSelect(data: any[], type: 'academicYear' | 'school') {
  let transformedData: [string, string][] = [];
  
  switch (type) {
    case 'academicYear':
      transformedData.push(["0", "-- Select Academic Year --"]);
      transformedData.push(...data.map((item): any => [item.id, item.name]));
      break;
    case 'school':
      transformedData.push(["0", "-- Select School --"]);
      transformedData.push(...data.map((item): any => [item.id, item.name]));
      break;
    default:
      throw new Error(`Unsupported type: ${type}`);
  }

  return transformedData;
}
