import type { WindowParameters, WindowRates, EstimateQuote } from "../../shared/estimate-contracts.ts";
const keys = ["product", "widthMm", "heightMm", "quantity", "glazing", "finish", "installation"];
export function parseWindowParameters(input: unknown): {
    ok: true;
    value: WindowParameters;
} | {
    ok: false;
    fieldErrors: Record<string, string>;
} {
    const errors: Record<string, string> = {};
    if (!input || typeof input !== "object" || Array.isArray(input))
        return { ok: false, fieldErrors: { parameters: "Проверьте параметры конструкции." } };
    const v = input as Record<string, unknown>;
    for (const key of Object.keys(v))
        if (!keys.includes(key))
            errors["parameters." + key] = "Неизвестный параметр.";
    if (v.product !== "window" && v.product !== "balcony-door")
        errors["parameters.product"] = "Выберите тип конструкции.";
    for (const key of ["widthMm", "heightMm"]) {
        const n = v[key];
        if (typeof n !== "number" || !Number.isInteger(n) || n < 600 || n > 2400 || n % 100 !== 0)
            errors["parameters." + key] = "От 600 до 2400 мм, шаг 100 мм.";
    }
    if (typeof v.quantity !== "number" || !Number.isInteger(v.quantity) || v.quantity < 1 || v.quantity > 6)
        errors["parameters.quantity"] = "Количество: от 1 до 6.";
    if (v.glazing !== "double" && v.glazing !== "triple")
        errors["parameters.glazing"] = "Выберите стеклопакет.";
    if (v.finish !== "white" && v.finish !== "graphite")
        errors["parameters.finish"] = "Выберите цвет.";
    if (typeof v.installation !== "boolean")
        errors["parameters.installation"] = "Укажите, нужен ли монтаж.";
    if (Object.keys(errors).length)
        return { ok: false, fieldErrors: errors };
    return { ok: true, value: { product: v.product as WindowParameters["product"], widthMm: v.widthMm as number, heightMm: v.heightMm as number, quantity: v.quantity as number, glazing: v.glazing as WindowParameters["glazing"], finish: v.finish as WindowParameters["finish"], installation: v.installation as boolean } };
}
export function quoteWindow(p: WindowParameters, rates: WindowRates, formulaVersion = "windows-v1"): EstimateQuote {
    const validated = parseWindowParameters(p);
    if (!validated.ok)
        throw new RangeError("Invalid window parameters");
    for (const rate of Object.values(rates))
        if (!Number.isSafeInteger(rate) || rate < 0 || rate > 100000000)
            throw new RangeError("Invalid rate");
    if (rates.graphitePercent > 100)
        throw new RangeError("Invalid percentage");
    const area = p.widthMm * p.heightMm * p.quantity;
    const frame = Math.round(area * (p.product === "window" ? rates.frameRateMinor : rates.doorRateMinor) / 1000000);
    const glass = p.glazing === "triple" ? Math.round(area * rates.tripleExtraMinor / 1000000) : 0;
    const finish = p.finish === "graphite" ? Math.round((frame + glass) * rates.graphitePercent / 100) : 0;
    const installation = p.installation ? rates.installationMinorEach * p.quantity : 0;
    const breakdown = [
        { code: "construction", label: "Конструкция", amountMinor: frame },
        { code: "glazing", label: "Доплата за стеклопакет", amountMinor: glass },
        { code: "finish", label: "Графитовый цвет", amountMinor: finish },
        { code: "installation", label: "Монтаж", amountMinor: installation },
    ];
    const totalMinor = breakdown.reduce((sum, line) => sum + line.amountMinor, 0);
    if (!Number.isSafeInteger(totalMinor) || totalMinor < 0)
        throw new RangeError("Unsafe estimate");
    return { formulaVersion, currency: "RUB", totalMinor, breakdown, assumptions: [
            "Демонстрационные ставки. Расчёт предварительный и не является офертой.",
            "Замер, состояние проёма, доставка и дополнительные работы уточняются отдельно.",
            "Площадь рассчитана по указанным габаритам; окончательную комплектацию согласуют после замера.",
        ] };
}
export const defaultWindowParameters: WindowParameters = { product: "window", widthMm: 1200, heightMm: 1400, quantity: 1, glazing: "double", finish: "white", installation: true };
