import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../../../contracts/estimate-request.schema.json" with { type: "json" };
import type { EstimateLeadRequest } from "../../shared/estimate-contracts.ts";
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile<EstimateLeadRequest>(schema);
export function validateEstimateRequest(input: unknown): {
    ok: true;
    data: EstimateLeadRequest;
} | {
    ok: false;
    fieldErrors?: Record<string, string>;
} {
    if (validate(input))
        return { ok: true, data: input };
    const fieldErrors: Record<string, string> = {};
    for (const error of validate.errors ?? []) {
        const parts = error.instancePath.split("/").filter(Boolean);
        if (error.keyword === "required")
            parts.push(String(error.params.missingProperty));
        const field = parts.join(".");
        if (field)
            fieldErrors[field] = "Проверьте значение поля.";
    }
    return { ok: false, fieldErrors: Object.keys(fieldErrors).length ? fieldErrors : undefined };
}
