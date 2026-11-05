import type {
  LeadCreateRequest,
  LeadReceipt,
  SiteConfig,
  TimePreference,
} from "../../../shared/contracts.ts";
import { getAvailableTimeSlots, validateTimePreference } from "./dateTime.ts";
import type { SubmitError } from "./lead-client.ts";

export type BookingStep = "offer" | "preference" | "contact";

export interface BookingState {
  step: BookingStep;
  serviceId: string;
  serviceOptions: Record<string, string>;
  resourceId?: string;
  preferred?: TimePreference;
  customer: {
    phone: string;
    name?: string;
  };
  consentAccepted: boolean;
  submitState: "idle" | "submitting" | "error" | "received";
  submitReceipt?: LeadReceipt;
  submitError?: SubmitError;
  idempotencyKey?: string;
  lastSubmittedPayload?: LeadCreateRequest;
  fieldErrors: Record<string, string>;
  cooldownSeconds?: number;
}

export type BookingAction =
  | { type: "SELECT_SERVICE"; serviceId: string; config: SiteConfig }
  | { type: "SET_OPTION"; optionId: string; value: string }
  | { type: "SET_RESOURCE"; resourceId?: string }
  | { type: "SET_DATE"; date: string; config: SiteConfig; now?: Date }
  | { type: "SET_TIME"; time: string }
  | { type: "SET_PHONE"; phone: string }
  | { type: "SET_NAME"; name: string }
  | { type: "SET_CONSENT"; accepted: boolean }
  | { type: "GO_TO_STEP"; targetStep: BookingStep; config: SiteConfig; now?: Date }
  | { type: "START_SUBMIT"; idempotencyKey: string; payload: LeadCreateRequest }
  | { type: "SUBMIT_SUCCESS"; receipt: LeadReceipt }
  | { type: "SUBMIT_ERROR"; error: SubmitError }
  | { type: "SET_COOLDOWN"; seconds: number }
  | { type: "RESET_NEW_LEAD"; config: SiteConfig };

export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createInitialState(config: SiteConfig): BookingState {
  const defaultService = config.services[0];
  const defaultOptions: Record<string, string> = {};

  if (defaultService) {
    for (const opt of defaultService.options) {
      if (opt.required && opt.values.length > 0) {
        defaultOptions[opt.id] = opt.values[0];
      }
    }
  }

  return {
    step: "offer",
    serviceId: defaultService?.id ?? "",
    serviceOptions: defaultOptions,
    resourceId: undefined,
    preferred: undefined,
    customer: {
      phone: "",
      name: "",
    },
    consentAccepted: false,
    submitState: "idle",
    fieldErrors: {},
  };
}

export function normalizeCustomerPhone(phone: string): string | null {
  const cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (/^\+7\d{10}$/.test(cleaned)) return cleaned;
  if (/^8\d{10}$/.test(cleaned)) return "+7" + cleaned.slice(1);
  if (/^7\d{10}$/.test(cleaned)) return "+7" + cleaned.slice(1);
  return null;
}

export function validateStep2(
  state: BookingState,
  config: SiteConfig,
  now: Date = new Date()
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const service = config.services.find((s) => s.id === state.serviceId);

  if (!service) {
    errors["serviceId"] = "Выберите услугу";
    return { valid: false, errors };
  }

  // Validate required options
  for (const option of service.options) {
    if (option.required) {
      const val = state.serviceOptions[option.id];
      if (!val || !option.values.includes(val)) {
        errors[`serviceOptions.${option.id}`] = `Выберите «${option.label}»`;
      }
    }
  }

  // Validate resource if required or selected
  if (config.booking.resourceSelection === "required") {
    if (!state.resourceId) {
      errors["resourceId"] = "Выберите специалиста";
    } else if (!service.resourceIds.includes(state.resourceId)) {
      errors["resourceId"] = "Выбранный специалист не оказывает эту услугу";
    }
  } else if (state.resourceId && !service.resourceIds.includes(state.resourceId)) {
    errors["resourceId"] = "Выбранный специалист не оказывает эту услугу";
  }

  // Validate date & time
  if (config.booking.preferenceRequired) {
    const prefValidation = validateTimePreference(state.preferred, config.booking, now);
    if (!prefValidation.valid) {
      if (!state.preferred?.date) {
        errors["preferred.date"] = "Укажите удобную дату";
      } else if (!state.preferred?.time) {
        errors["preferred.time"] = "Выберите удобное время";
      } else {
        errors["preferred"] = prefValidation.error ?? "Некорректная дата или время";
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateStep3(
  state: BookingState,
  config: SiteConfig
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  // Validate phone
  const rawPhone = state.customer.phone.trim();
  if (!rawPhone) {
    errors["customer.phone"] = "Укажите телефон";
  } else {
    const normalized = normalizeCustomerPhone(rawPhone);
    if (!normalized) {
      errors["customer.phone"] = "Введите корректный номер телефона (например, +7 000 000-00-00)";
    } else if (config.mode === "demo" && normalized !== "+70000000000") {
      errors["customer.phone"] = "В демо-режиме используется только номер +70000000000";
    }
  }

  // Validate name (optional, max 80 chars)
  const trimmedName = state.customer.name?.trim();
  if (trimmedName && trimmedName.length > 80) {
    errors["customer.name"] = "Имя не должно превышать 80 символов";
  }

  // Validate consent
  if (!state.consentAccepted) {
    errors["consent.accepted"] = "Необходимо согласие на обработку данных";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function buildLeadPayload(
  state: BookingState,
  config: SiteConfig
): LeadCreateRequest | null {
  const normalizedPhone = normalizeCustomerPhone(state.customer.phone.trim());
  if (!normalizedPhone || !state.consentAccepted) return null;

  const service = config.services.find((s) => s.id === state.serviceId);
  if (!service) return null;

  const validOptions: Record<string, string> = {};
  for (const opt of service.options) {
    const val = state.serviceOptions[opt.id];
    if (val && opt.values.includes(val)) {
      validOptions[opt.id] = val;
    }
  }

  const payload: LeadCreateRequest = {
    siteKey: config.id,
    configVersion: config.contentVersion,
    kind: "booking",
    serviceId: state.serviceId,
    serviceOptions: validOptions,
    customer: {
      phone: normalizedPhone,
    },
    consent: {
      accepted: true,
      version: config.legal.consentVersion,
    },
    antiBot: {
      website: "",
    },
  };

  const trimmedName = state.customer.name?.trim();
  if (trimmedName && trimmedName.length > 0) {
    payload.customer.name = trimmedName;
  }

  if (state.resourceId && service.resourceIds.includes(state.resourceId)) {
    payload.resourceId = state.resourceId;
  }

  if (state.preferred) {
    payload.preferred = {
      date: state.preferred.date,
      time: state.preferred.time,
      timezone: "Europe/Moscow",
    };
  }

  return payload;
}

export function bookingReducer(state: BookingState, action: BookingAction): BookingState {
  switch (action.type) {
    case "SELECT_SERVICE": {
      if (action.serviceId === state.serviceId) return state;
      const nextService = action.config.services.find((s) => s.id === action.serviceId);
      if (!nextService) return state;

      // Filter incompatible options
      const nextOptions: Record<string, string> = {};
      for (const opt of nextService.options) {
        const prevVal = state.serviceOptions[opt.id];
        if (prevVal && opt.values.includes(prevVal)) {
          nextOptions[opt.id] = prevVal;
        } else if (opt.required && opt.values.length > 0) {
          nextOptions[opt.id] = opt.values[0];
        }
      }

      // Check if existing resource is compatible
      let nextResource = state.resourceId;
      if (nextResource && !nextService.resourceIds.includes(nextResource)) {
        nextResource = undefined;
      }

      return {
        ...state,
        serviceId: action.serviceId,
        serviceOptions: nextOptions,
        resourceId: nextResource,
        fieldErrors: {},
      };
    }

    case "SET_OPTION": {
      return {
        ...state,
        serviceOptions: {
          ...state.serviceOptions,
          [action.optionId]: action.value,
        },
        fieldErrors: {
          ...state.fieldErrors,
          [`serviceOptions.${action.optionId}`]: "",
        },
      };
    }

    case "SET_RESOURCE": {
      return {
        ...state,
        resourceId: action.resourceId,
        fieldErrors: {
          ...state.fieldErrors,
          resourceId: "",
        },
      };
    }

    case "SET_DATE": {
      const now = action.now ?? new Date();
      const slots = getAvailableTimeSlots(action.date, action.config.booking, now);
      let nextTime = state.preferred?.time;

      // Invalidate time if not available on new date
      if (nextTime && !slots.includes(nextTime)) {
        nextTime = undefined;
      }

      return {
        ...state,
        preferred: nextTime
          ? { date: action.date, time: nextTime, timezone: "Europe/Moscow" }
          : action.date
          ? { date: action.date, time: "", timezone: "Europe/Moscow" }
          : undefined,
        fieldErrors: {
          ...state.fieldErrors,
          "preferred.date": "",
          preferred: "",
        },
      };
    }

    case "SET_TIME": {
      if (!state.preferred?.date) return state;
      return {
        ...state,
        preferred: {
          ...state.preferred,
          time: action.time,
        },
        fieldErrors: {
          ...state.fieldErrors,
          "preferred.time": "",
          preferred: "",
        },
      };
    }

    case "SET_PHONE": {
      return {
        ...state,
        customer: {
          ...state.customer,
          phone: action.phone,
        },
        fieldErrors: {
          ...state.fieldErrors,
          "customer.phone": "",
        },
      };
    }

    case "SET_NAME": {
      return {
        ...state,
        customer: {
          ...state.customer,
          name: action.name,
        },
        fieldErrors: {
          ...state.fieldErrors,
          "customer.name": "",
        },
      };
    }

    case "SET_CONSENT": {
      return {
        ...state,
        consentAccepted: action.accepted,
        fieldErrors: {
          ...state.fieldErrors,
          "consent.accepted": "",
        },
      };
    }

    case "GO_TO_STEP": {
      const target = action.targetStep;
      if (target === "offer") {
        return { ...state, step: "offer", fieldErrors: {} };
      }

      if (target === "preference") {
        return { ...state, step: "preference", fieldErrors: {} };
      }

      if (target === "contact") {
        const step2Check = validateStep2(state, action.config, action.now);
        if (!step2Check.valid) {
          return {
            ...state,
            step: "preference",
            fieldErrors: step2Check.errors,
          };
        }
        return { ...state, step: "contact", fieldErrors: {} };
      }

      return state;
    }

    case "START_SUBMIT": {
      return {
        ...state,
        submitState: "submitting",
        submitError: undefined,
        idempotencyKey: action.idempotencyKey,
        lastSubmittedPayload: action.payload,
      };
    }

    case "SUBMIT_SUCCESS": {
      return {
        ...state,
        submitState: "received",
        submitReceipt: action.receipt,
        submitError: undefined,
        fieldErrors: {},
      };
    }

    case "SUBMIT_ERROR": {
      const fieldErrors: Record<string, string> = {
        ...state.fieldErrors,
        ...(action.error.fieldErrors ?? {}),
      };

      return {
        ...state,
        submitState: "error",
        submitError: action.error,
        fieldErrors,
        cooldownSeconds: action.error.retryAfterSeconds,
      };
    }

    case "SET_COOLDOWN": {
      return {
        ...state,
        cooldownSeconds: action.seconds,
      };
    }

    case "RESET_NEW_LEAD": {
      const initial = createInitialState(action.config);
      return {
        ...initial,
        step: "offer",
      };
    }

    default:
      return state;
  }
}
