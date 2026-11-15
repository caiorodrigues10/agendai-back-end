/// <reference types="vitest/globals" />
import {
  hasInternalPermission,
  INTERNAL_PERMISSIONS,
  INTERNAL_PROFILE_PERMISSIONS,
} from "./internalPermissions";

describe("permissão interna de tráfego", () => {
  it("mantém o acesso padrão de administradores internos existentes", () => {
    expect(hasInternalPermission(undefined, INTERNAL_PERMISSIONS.TRAFFIC_READ)).toBe(true);
    expect(hasInternalPermission([], INTERNAL_PERMISSIONS.TRAFFIC_READ)).toBe(true);
  });

  it("aceita a permissão explícita e o perfil global internal:all", () => {
    expect(
      hasInternalPermission([INTERNAL_PERMISSIONS.TRAFFIC_READ], INTERNAL_PERMISSIONS.TRAFFIC_READ),
    ).toBe(true);
    expect(
      hasInternalPermission([INTERNAL_PERMISSIONS.ALL], INTERNAL_PERMISSIONS.TRAFFIC_READ),
    ).toBe(true);
  });

  it("nega uma lista explícita sem a permissão de tráfego", () => {
    expect(
      hasInternalPermission(
        [INTERNAL_PERMISSIONS.DASHBOARD_READ],
        INTERNAL_PERMISSIONS.TRAFFIC_READ,
      ),
    ).toBe(false);
  });

  it("inclui leitura de tráfego em todos os perfis internos", () => {
    for (const permissions of Object.values(INTERNAL_PROFILE_PERMISSIONS)) {
      expect(
        hasInternalPermission(permissions, INTERNAL_PERMISSIONS.TRAFFIC_READ),
      ).toBe(true);
    }
  });
});
