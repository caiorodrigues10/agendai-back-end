import type { OperationMode } from '@/modules/barbershops/dtos/IBarbershopResponseDTO';

export function supportsQueue(mode: OperationMode | undefined | null): boolean {
  return mode === 'QUEUE_ONLY' || mode === 'HYBRID' || mode == null;
}

export function supportsAppointments(mode: OperationMode | undefined | null): boolean {
  return mode === 'APPOINTMENTS_ONLY' || mode === 'HYBRID' || mode == null;
}

export function operationModeLabel(mode: OperationMode | undefined | null): string {
  switch (mode) {
    case 'QUEUE_ONLY': return 'Somente fila';
    case 'APPOINTMENTS_ONLY': return 'Somente agenda';
    case 'HYBRID': return 'Fila e agenda';
    default: return 'Fila e agenda';
  }
}
