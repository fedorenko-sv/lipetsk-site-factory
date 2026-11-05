/**
 * Реестр адаптеров уведомлений (PR3, §12). Явный список: неизвестный
 * adapterId — конфигурационная ошибка, автоматического переключения канала нет.
 */
import type { NotificationPort } from "../leads/ports.ts";

export type AdapterFactory = () => NotificationPort;

const ALLOWED_ADAPTER_IDS = ["recording"] as const;
export type AllowedAdapterId = (typeof ALLOWED_ADAPTER_IDS)[number];

export function isKnownAdapterId(adapterId: string): adapterId is AllowedAdapterId {
  return (ALLOWED_ADAPTER_IDS as readonly string[]).includes(adapterId);
}

export class AdapterRegistry {
  #factories = new Map<string, AdapterFactory>();
  #instances = new Map<string, NotificationPort>();

  register(adapterId: AllowedAdapterId, factory: AdapterFactory): void {
    this.#factories.set(adapterId, factory);
  }

  /** Бросает ошибку конфигурации, если адаптер не зарегистрирован. */
  get(adapterId: string): NotificationPort {
    if (!isKnownAdapterId(adapterId)) {
      throw new Error(`unknown adapter: ${adapterId}`);
    }
    const existing = this.#instances.get(adapterId);
    if (existing) return existing;
    const factory = this.#factories.get(adapterId);
    if (!factory) throw new Error(`adapter not configured: ${adapterId}`);
    const instance = factory();
    this.#instances.set(adapterId, instance);
    return instance;
  }
}
