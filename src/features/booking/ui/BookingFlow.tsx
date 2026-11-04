"use client";

import { useState } from "react";
import type { SiteConfig } from "@/config/sites/types";
import { OfferStep, formatPrice } from "./OfferStep";

interface BookingFlowProps {
  config: SiteConfig;
}

export function BookingFlow({ config }: BookingFlowProps) {
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    config.services[0]?.id ?? null
  );
  const [isNoticeOpen, setIsNoticeOpen] = useState(false);

  const selectedService = config.services.find((s) => s.id === selectedServiceId);

  return (
    <div className="min-h-screen bg-[#121316] text-[#f3f4f6]">
      <OfferStep
        config={config}
        selectedServiceId={selectedServiceId}
        onSelectService={(id) => setSelectedServiceId(id)}
        onCtaClick={() => setIsNoticeOpen(true)}
      />

      {/* Preparation State Modal / Dialog */}
      {isNoticeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="prep-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsNoticeOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#181a1f] border border-[#2a2e37] rounded-2xl p-6 shadow-2xl relative text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-400/10 text-amber-300 border border-amber-400/20 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Этап F1 · Прототип
            </div>

            <h3 id="prep-modal-title" className="text-xl font-bold text-white mb-2 tracking-tight">
              Выбор времени готовится
            </h3>

            <p className="text-sm text-[#9ca3af] leading-relaxed mb-4">
              На данном этапе готов первый экран с предложением и прейскурантом.
              Выбор предпочтительного времени и контактная форма будут подключены на следующих этапах (F2–F3).
            </p>

            {selectedService && (
              <div className="bg-[#121316] rounded-xl p-3.5 border border-[#2a2e37] mb-5 text-xs">
                <span className="text-[#6b7280] block mb-1">Предварительно выбрано:</span>
                <div className="flex items-center justify-between text-sm font-medium">
                  <span className="text-white">{selectedService.name}</span>
                  <span className="text-amber-400 font-bold ml-2">
                    {formatPrice(selectedService.price)}
                  </span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsNoticeOpen(false)}
              className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-amber-400 hover:bg-amber-300 text-stone-950 transition-colors cursor-pointer"
            >
              Понятно, вернуться к прайсу
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

