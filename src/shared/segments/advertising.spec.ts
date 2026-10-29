import { describe, expect, it } from "vitest";
import {
  ADVERTISING_RESTRICTED_NOTIFICATION_TYPES,
  isAdvertisingRestricted,
  isNotificationAllowedForSegment,
  isPromotionalNotificationType,
} from "./advertising";

describe("restrição de publicidade por segmento", () => {
  it("só o segmento restrito é bloqueado", () => {
    expect(isAdvertisingRestricted("LAW_FIRM")).toBe(true);
    expect(isAdvertisingRestricted("BARBERSHOP")).toBe(false);
    expect(isAdvertisingRestricted("HAIR_SALON")).toBe(false);
    expect(isAdvertisingRestricted(null)).toBe(false);
    expect(isAdvertisingRestricted(undefined)).toBe(false);
  });

  it("classifica os tipos de notificação promocionais", () => {
    for (const type of ADVERTISING_RESTRICTED_NOTIFICATION_TYPES) {
      expect(isPromotionalNotificationType(type)).toBe(true);
    }
    expect(isPromotionalNotificationType("APPOINTMENT_REMINDER")).toBe(false);
    expect(isPromotionalNotificationType("NPS_SURVEY")).toBe(true);
    expect(isPromotionalNotificationType("CRM_CAMPAIGN")).toBe(true);
  });

  it("bloqueia só a notificação promocional no segmento restrito", () => {
    expect(isNotificationAllowedForSegment("CRM_CAMPAIGN", "LAW_FIRM")).toBe(false);
    expect(isNotificationAllowedForSegment("NPS_SURVEY", "LAW_FIRM")).toBe(false);
    expect(isNotificationAllowedForSegment("REVIEW_REQUESTED", "LAW_FIRM")).toBe(false);
    expect(isNotificationAllowedForSegment("APPOINTMENT_REMINDER", "LAW_FIRM")).toBe(true);
    expect(isNotificationAllowedForSegment("CRM_CAMPAIGN", "BARBERSHOP")).toBe(true);
    expect(isNotificationAllowedForSegment("CRM_CAMPAIGN", null)).toBe(true);
  });
});
