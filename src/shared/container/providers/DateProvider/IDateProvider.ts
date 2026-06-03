export interface IDateProvider {
  addDays(date: Date, days: number): Date;
  addHours(date: Date, hours: number): Date;
  isBefore(startDate: Date, endDate: Date): boolean;
  isAfter(startDate: Date, endDate: Date): boolean;
  now(): Date;
  formatToISOString(date: Date): string;
}
