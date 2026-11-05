/**
 * Runtime-валидация по JSON-схемам из contracts/openapi.json (PR3, §7).
 * Ajv 2020 + ajv-formats, компиляция один раз на процесс. Используются
 * только components.schemas с переписыванием локальных $ref; весь OpenAPI
 * как JSON Schema не трактуется.
 */
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { LeadCreateRequest } from "../../shared/contracts.ts";

export interface SchemaPass {
  ok: true;
  data: LeadCreateRequest;
}
export interface SchemaFail {
  ok: false;
  /** undefined — структура не объект/корень битый; поле-ошибки необязательны. */
  fieldErrors?: Record<string, string>;
}
export type SchemaResult = SchemaPass | SchemaFail;

interface OpenApiDoc {
  components?: { schemas?: Record<string, Record<string, unknown>> };
}

const ID_PREFIX = "urn:lsf:schema:";

function rewriteRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "$ref" && typeof value === "string" && value.startsWith("#/components/schemas/")) {
        out[key] = `${ID_PREFIX}${value.slice("#/components/schemas/".length)}`;
      } else {
        out[key] = rewriteRefs(value);
      }
    }
    return out;
  }
  return node;
}

function toDotPath(instancePath: string, segment?: string): string {
  const base = instancePath.replace(/^\//, "").split("/").filter(Boolean).join(".");
  return segment ? (base ? `${base}.${segment}` : segment) : base;
}

/** Документированные пути fieldErrors (docs/09); остальные — как есть. */
const FIELD_MESSAGES: Record<string, string> = {
  siteKey: "Неизвестный параметр запроса.",
  configVersion: "Некорректная версия конфигурации.",
  kind: "Неподдерживаемый тип заявки.",
  serviceId: "Выберите услугу.",
  serviceOptions: "Проверьте параметры услуги.",
  resourceId: "Выберите корректный ресурс.",
  preferred: "Проверьте желаемое время.",
  "preferred.date": "Проверьте желаемую дату.",
  "preferred.time": "Проверьте желаемое время.",
  "customer.phone": "Укажите корректный телефон.",
  "customer.name": "Укажите имя (1–80 символов).",
  "consent.accepted": "Необходимо согласие.",
  "consent.version": "Согласие устарело.",
  attribution: "Проверьте параметры перехода.",
  antiBot: "Некорректные данные формы.",
};

let compiled: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
  if (compiled) return compiled;
  const file = path.join(process.cwd(), "contracts", "openapi.json");
  const doc = JSON.parse(readFileSync(file, "utf8")) as OpenApiDoc;
  const schemas = doc.components?.schemas ?? {};
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  for (const [name, schema] of Object.entries(schemas)) {
    const rewritten = rewriteRefs(schema) as Record<string, unknown>;
    ajv.addSchema({ ...rewritten, $id: `${ID_PREFIX}${name}` });
  }
  const validator = ajv.getSchema(`${ID_PREFIX}LeadCreateRequest`) as
    | ValidateFunction
    | undefined;
  if (!validator) throw new Error("схема LeadCreateRequest не найдена в контракте");
  compiled = validator;
  return compiled;
}

export function validateLeadRequest(raw: unknown): SchemaResult {
  const validate = getValidator();
  if (validate(raw)) return { ok: true, data: raw as LeadCreateRequest };
  const errors = validate.errors ?? [];
  if (errors.length === 0) return { ok: false };
  const fieldErrors: Record<string, string> = {};
  for (const err of errors) {
    // Корень: не объект или массив/null — общих полей нет.
    if (err.instancePath === "" && (err.keyword === "type" || err.keyword === "enum")) {
      return { ok: false };
    }
    if (err.keyword === "additionalProperties") {
      const extra = String(err.params.additionalProperty);
      const field = toDotPath(err.instancePath, extra);
      fieldErrors[field] = FIELD_MESSAGES[field] ?? "Неизвестный параметр запроса.";
      continue;
    }
    if (err.keyword === "required") {
      const missing = String(err.params.missingProperty);
      const field = toDotPath(err.instancePath, missing);
      fieldErrors[field] = FIELD_MESSAGES[field] ?? "Заполните обязательное поле.";
      continue;
    }
    const field = toDotPath(err.instancePath);
    if (!(field in fieldErrors)) {
      fieldErrors[field] = FIELD_MESSAGES[field] ?? "Проверьте данные формы.";
    }
  }
  return Object.keys(fieldErrors).length > 0 ? { ok: false, fieldErrors } : { ok: false };
}
