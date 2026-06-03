import dayjs from "dayjs";
import { IDateProvider } from "../IDateProvider";

export class DayjsDateProvider implements IDateProvider {
  addDays(date: Date, days: number): Date {
    return dayjs(date).add(days, "day").toDate();
  }
  addHours(date: Date, hours: number): Date {
    return dayjs(date).add(hours, "hour").toDate();
  }
  isBefore(startDate: Date, endDate: Date): boolean {
    return dayjs(startDate).isBefore(endDate);
  }
  isAfter(startDate: Date, endDate: Date): boolean {
    return dayjs(startDate).isAfter(endDate);
  }
  now(): Date {
    return dayjs().toDate();
  }
  formatToISOString(date: Date): string {
    return dayjs(date).toISOString();
  }
}
