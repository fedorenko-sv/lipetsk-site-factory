import { estimateConfig } from "../../features/estimate/config.ts";
export function resolveAllowedEstimate(env: NodeJS.ProcessEnv, key: string) {
    const allowed = (env.ALLOWED_SITE_KEYS ?? "").split(",").map(s => s.trim());
    return key === estimateConfig.id && allowed.includes(key) ? estimateConfig : null;
}
