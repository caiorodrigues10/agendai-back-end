export type SubscriptionStatus = 'TRIALING' | 'PENDING' | 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'UNPAID';

export type SubscriptionEvent =
  | 'TRIAL_START'
  | 'TRIAL_END'
  | 'CHECKOUT_INITIATED'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_DECLINED'
  | 'PAYMENT_ERROR'
  | 'WEBHOOK_CONFIRMED'
  | 'CANCEL_REQUESTED'
  | 'INVOICE_OVERDUE'
  | 'RECOVERY_ATTEMPT';

const TRANSITIONS: Record<SubscriptionStatus, SubscriptionEvent[]> = {
  TRIALING: ['TRIAL_END', 'CHECKOUT_INITIATED', 'PAYMENT_APPROVED', 'CANCEL_REQUESTED'],
  PENDING: ['PAYMENT_APPROVED', 'PAYMENT_DECLINED', 'PAYMENT_ERROR', 'INVOICE_OVERDUE', 'CANCEL_REQUESTED'],
  ACTIVE: ['INVOICE_OVERDUE', 'CANCEL_REQUESTED'],
  CANCELED: ['RECOVERY_ATTEMPT'],
  PAST_DUE: ['PAYMENT_APPROVED', 'INVOICE_OVERDUE', 'CANCEL_REQUESTED'],
  UNPAID: ['PAYMENT_APPROVED', 'CANCEL_REQUESTED'],
};

const TRANSITION_TABLE: Record<SubscriptionStatus, Partial<Record<SubscriptionEvent, SubscriptionStatus>>> = {
  TRIALING: {
    TRIAL_END: 'PENDING',
    CHECKOUT_INITIATED: 'PENDING',
    PAYMENT_APPROVED: 'ACTIVE',
    CANCEL_REQUESTED: 'CANCELED',
  },
  PENDING: {
    PAYMENT_APPROVED: 'ACTIVE',
    PAYMENT_DECLINED: 'PENDING',
    PAYMENT_ERROR: 'PENDING',
    INVOICE_OVERDUE: 'PAST_DUE',
    CANCEL_REQUESTED: 'CANCELED',
  },
  ACTIVE: {
    INVOICE_OVERDUE: 'PAST_DUE',
    CANCEL_REQUESTED: 'CANCELED',
  },
  CANCELED: {
    RECOVERY_ATTEMPT: 'PENDING',
  },
  PAST_DUE: {
    PAYMENT_APPROVED: 'ACTIVE',
    INVOICE_OVERDUE: 'PAST_DUE',
    CANCEL_REQUESTED: 'CANCELED',
  },
  UNPAID: {
    PAYMENT_APPROVED: 'ACTIVE',
    CANCEL_REQUESTED: 'CANCELED',
  },
};

export function getNextStatus(
  currentStatus: SubscriptionStatus,
  event: SubscriptionEvent
): SubscriptionStatus | null {
  const allowed = TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(event)) return null;
  return TRANSITION_TABLE[currentStatus]?.[event] ?? null;
}

export function applyTransition(
  currentStatus: SubscriptionStatus,
  event: SubscriptionEvent,
  context: { isTrialPeriod: boolean; isOptionalPayment?: boolean }
): SubscriptionStatus {
  if (context.isTrialPeriod && event === 'PAYMENT_DECLINED' && context.isOptionalPayment) {
    return 'TRIALING';
  }
  if (context.isTrialPeriod && event === 'PAYMENT_ERROR' && context.isOptionalPayment) {
    return 'TRIALING';
  }

  const next = getNextStatus(currentStatus, event);
  if (!next) {
    throw new Error(`Invalid transition: ${currentStatus} + ${event}`);
  }
  return next;
}

export function isValidTransition(
  currentStatus: SubscriptionStatus,
  event: SubscriptionEvent
): boolean {
  return getNextStatus(currentStatus, event) !== null;
}
