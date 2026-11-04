import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "../../src/server/leads/phone.ts";

const NBSP = "\u00A0";

test("формат +7 со скобками и дефисами в live", () => {
  assert.equal(normalizePhone("+7 (999) 123-45-67", "live"), "+79991234567");
});

test("форма 8 без плюса в live", () => {
  assert.equal(normalizePhone("8 999 123 45 67", "live"), "+79991234567");
});

test("внешние и неразрывные пробелы допускаются", () => {
  assert.equal(normalizePhone(`  ${NBSP}+7${NBSP}(999)${NBSP}123-45-67${NBSP}  `, "live"), "+79991234567");
  assert.equal(normalizePhone(`${NBSP}8${NBSP}999${NBSP}123${NBSP}45${NBSP}67`, "live"), "+79991234567");
});

test("пустой ввод и нестроковые значения", () => {
  for (const bad of ["", "   ", null, undefined, 79991234567, {}, [], true]) {
    assert.equal(normalizePhone(bad, "live"), null, `вход: ${String(bad)}`);
  }
});

test("неверное число цифр", () => {
  assert.equal(normalizePhone("+7 (999) 123-45-6", "live"), null, "10 цифр с +7");
  assert.equal(normalizePhone("+7 (999) 123-45-678", "live"), null, "12 цифр с +7");
  assert.equal(normalizePhone("8 999 123 45 6", "live"), null, "10 цифр с 8");
  assert.equal(normalizePhone("8 999 123 45 678", "live"), null, "12 цифр с 8");
});

test("другая страна и 10 цифр без префикса", () => {
  assert.equal(normalizePhone("+1 (234) 567-89-01", "live"), null, "+1");
  assert.equal(normalizePhone("+370 123 4567", "live"), null, "+370");
  assert.equal(normalizePhone("999 123 45 67", "live"), null, "10 цифр без префикса");
});

test("начальная 7 без плюса", () => {
  assert.equal(normalizePhone("7 (999) 123-45-67", "live"), null);
});

test("плюс не в начале и лишние плюсы", () => {
  assert.equal(normalizePhone("+8 (999) 123-45-67", "live"), null, "+8");
  assert.equal(normalizePhone("++79991234567", "live"), null, "два плюса");
  assert.equal(normalizePhone("8+9991234567", "live"), null, "плюс внутри");
  assert.equal(normalizePhone("(+7) 999 123 45 67", "live"), null, "плюс в скобках");
});

test("буквы и добавочный номер", () => {
  assert.equal(normalizePhone("+7 999 123 45 67 add 12", "live"), null, "буквы");
  assert.equal(normalizePhone("+79991234567 ext.5", "live"), null, "ext");
  assert.equal(normalizePhone("+79991234567#5", "live"), null, "добавочный через #");
});

test("переносы строк и управляющие символы", () => {
  assert.equal(normalizePhone("+799912\n34567", "live"), null, "\\n внутри");
  assert.equal(normalizePhone("+799912345\t67", "live"), null, "табуляция внутри");
  assert.equal(normalizePhone("+79991234567\r", "live"), null, "возврат каретки внутри/снаружи");
  assert.equal(normalizePhone(" +79991234567 ", "live"), "+79991234567", "внешние обычные пробелы обрезаются");
});

test("синтетический номер: demo принимает, live отклоняет", () => {
  assert.equal(normalizePhone("+70000000000", "demo"), "+70000000000");
  assert.equal(normalizePhone("+70000000000", "live"), null);
  assert.equal(normalizePhone("8 (000) 000-00-00", "demo"), "+70000000000");
});

test("обычный номер в demo отклоняется", () => {
  assert.equal(normalizePhone("+7 (999) 123-45-67", "demo"), null);
});
