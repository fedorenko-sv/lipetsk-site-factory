"use client";

import { useReducer, useRef, useEffect, useCallback } from "react";
import type { SiteConfig } from "@/shared/contracts";
import {
  bookingReducer,
  createInitialState,
  buildLeadPayload,
  generateUUID,
  validateStep2,
  validateStep3,
} from "../client/state";
import { submitLead, SubmitError } from "../client/lead-client";
import { OfferStep } from "./OfferStep";
import { PreferenceStep } from "./PreferenceStep";
import { ContactStep } from "./ContactStep";

interface BookingFlowProps {
  config: SiteConfig;
}

export function BookingFlow({ config }: BookingFlowProps) {
  const [state, dispatch] = useReducer(bookingReducer, config, createInitialState);

  const offerHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const preferenceHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const contactHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const currentSubmitKeyRef = useRef<string | null>(null);

  // Focus management on step change
  useEffect(() => {
    if (state.step === "offer") {
      offerHeadingRef.current?.focus();
    } else if (state.step === "preference") {
      preferenceHeadingRef.current?.focus();
    } else if (state.step === "contact") {
      contactHeadingRef.current?.focus();
    }
  }, [state.step]);

  // Rate-limiting cooldown countdown
  useEffect(() => {
    if (!state.cooldownSeconds || state.cooldownSeconds <= 0) return;

    const timer = setInterval(() => {
      dispatch({ type: "SET_COOLDOWN", seconds: (state.cooldownSeconds ?? 1) - 1 });
    }, 1000);

    return () => clearInterval(timer);
  }, [state.cooldownSeconds]);

  const handleNextToPreference = useCallback(() => {
    dispatch({ type: "GO_TO_STEP", targetStep: "preference", config });
  }, [config]);

  const handleNextToContact = useCallback(() => {
    dispatch({ type: "GO_TO_STEP", targetStep: "contact", config });
  }, [config]);

  const handleBackToOffer = useCallback(() => {
    dispatch({ type: "GO_TO_STEP", targetStep: "offer", config });
  }, [config]);

  const handleBackToPreference = useCallback(() => {
    dispatch({ type: "GO_TO_STEP", targetStep: "preference", config });
  }, [config]);

  const handleSelectService = useCallback(
    (serviceId: string) => {
      dispatch({ type: "SELECT_SERVICE", serviceId, config });
    },
    [config]
  );

  const handleSubmit = useCallback(async () => {
    if (state.submitState === "submitting") return;
    if (state.cooldownSeconds && state.cooldownSeconds > 0) return;

    // Validate step 2 fields first
    const step2Check = validateStep2(state, config);
    if (!step2Check.valid) {
      dispatch({
        type: "SUBMIT_ERROR",
        error: new SubmitError({
          kind: "http",
          message: "Пожалуйста, проверьте параметры услуги и времени",
          fieldErrors: step2Check.errors,
        }),
      });
      return;
    }

    // Validate step 3 fields next
    const step3Check = validateStep3(state, config);
    if (!step3Check.valid) {
      dispatch({
        type: "SUBMIT_ERROR",
        error: new SubmitError({
          kind: "http",
          message: "Пожалуйста, проверьте введённые данные",
          fieldErrors: step3Check.errors,
        }),
      });
      return;
    }

    const payload = buildLeadPayload(state, config);
    if (!payload) {
      dispatch({
        type: "SUBMIT_ERROR",
        error: new SubmitError({
          kind: "http",
          message: "Не удалось сформировать заявку. Проверьте заполненные поля.",
        }),
      });
      return;
    }

    // Determine idempotency key
    // If payload is unchanged from last submission, preserve key. Otherwise, create a fresh UUID.
    const isPayloadUnchanged =
      state.lastSubmittedPayload &&
      JSON.stringify(state.lastSubmittedPayload) === JSON.stringify(payload);

    const idempotencyKey =
      isPayloadUnchanged && state.idempotencyKey
        ? state.idempotencyKey
        : generateUUID();

    currentSubmitKeyRef.current = idempotencyKey;

    dispatch({
      type: "START_SUBMIT",
      idempotencyKey,
      payload,
    });

    try {
      const result = await submitLead(payload, { idempotencyKey });

      // Late response check: only accept if key matches current submission
      if (currentSubmitKeyRef.current === idempotencyKey) {
        dispatch({ type: "SUBMIT_SUCCESS", receipt: result.receipt });
      }
    } catch (err: unknown) {
      if (currentSubmitKeyRef.current === idempotencyKey) {
        if (err instanceof SubmitError) {
          dispatch({ type: "SUBMIT_ERROR", error: err });
        } else {
          dispatch({
            type: "SUBMIT_ERROR",
            error: new SubmitError({
              kind: "network",
              message: "Не удалось отправить заявку. Попробуйте повторить.",
            }),
          });
        }
      }
    }
  }, [state, config]);

  const handleReset = useCallback(() => {
    currentSubmitKeyRef.current = null;
    dispatch({ type: "RESET_NEW_LEAD", config });
  }, [config]);

  const themeClass = config.theme === "editorial" ? "theme-editorial" : "theme-technical";

  return (
    <div className={`min-h-screen ${themeClass}`}>
      {state.step === "offer" && (
        <OfferStep
          config={config}
          selectedServiceId={state.serviceId}
          onSelectService={handleSelectService}
          onNext={handleNextToPreference}
          headingRef={offerHeadingRef}
        />
      )}

      {state.step === "preference" && (
        <PreferenceStep
          config={config}
          state={state}
          onSelectService={handleSelectService}
          onSetOption={(optionId, value) =>
            dispatch({ type: "SET_OPTION", optionId, value })
          }
          onSetResource={(resourceId) =>
            dispatch({ type: "SET_RESOURCE", resourceId })
          }
          onSetDate={(date) => dispatch({ type: "SET_DATE", date, config })}
          onSetTime={(time) => dispatch({ type: "SET_TIME", time })}
          onBack={handleBackToOffer}
          onNext={handleNextToContact}
          headingRef={preferenceHeadingRef}
        />
      )}

      {state.step === "contact" && (
        <ContactStep
          config={config}
          state={state}
          onSetPhone={(phone) => dispatch({ type: "SET_PHONE", phone })}
          onSetName={(name) => dispatch({ type: "SET_NAME", name })}
          onSetConsent={(accepted) =>
            dispatch({ type: "SET_CONSENT", accepted })
          }
          onSubmit={handleSubmit}
          onRetry={handleSubmit}
          onReset={handleReset}
          onBack={handleBackToPreference}
          headingRef={contactHeadingRef}
        />
      )}
    </div>
  );
}
