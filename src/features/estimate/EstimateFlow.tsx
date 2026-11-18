"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { EstimateLeadRequest, EstimateSiteConfig, WindowParameters } from "@/shared/estimate-contracts";
import type { LeadReceipt } from "@/shared/contracts";
import { submitLead, SubmitError } from "@/features/booking/client/lead-client";
import { generateUUID, normalizeCustomerPhone } from "@/features/booking/client/state";
import { formatAmount } from "@/features/booking/client/formatters";
import { defaultWindowParameters, parseWindowParameters, quoteWindow } from "./domain";
import { WindowDrawing } from "./WindowDrawing";
import "./estimate.css";

type Stage = "parameters" | "quote" | "contact" | "receipt";
export function EstimateFlow({ config, initialProduct = "window" }: { config: EstimateSiteConfig; initialProduct?: WindowParameters["product"] }) {
  const [stage, setStage] = useState<Stage>("parameters");
  const [parameters, setParameters] = useState<WindowParameters>({...defaultWindowParameters, product:initialProduct});
  const [width, setWidth] = useState("1200");
  const [height, setHeight] = useState("1400");
  const [quantity, setQuantity] = useState("1");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [stale, setStale] = useState(false);
  const [receipt, setReceipt] = useState<LeadReceipt | null>(null);
  const attempt = useRef<{body:string;key:string} | null>(null);
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStage = useRef(stage);
  useEffect(() => {
    if (previousStage.current !== stage) heading.current?.focus();
    previousStage.current = stage;
  }, [stage]);
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const raw = {...parameters, widthMm:Number(width), heightMm:Number(height), quantity:Number(quantity)};
  const parsed = parseWindowParameters(raw);
  const quote = quoteWindow(parsed.ok ? parsed.value : parameters, config.rates, config.formulaVersion);
  const setOption = <K extends keyof WindowParameters>(key:K, value:WindowParameters[K]) => {
    setParameters(p => ({...p,[key]:value})); setFieldErrors({}); setError("");
  };
  function calculate(event:React.FormEvent) {
    event.preventDefault();
    if(!parsed.ok) { setFieldErrors(parsed.fieldErrors); setError("Проверьте размеры и количество."); return; }
    setParameters(parsed.value); setFieldErrors({}); setError(""); setStage("quote");
  }
  function clearContactError() { setFieldErrors({}); setError(""); }
  async function send(event:React.FormEvent) {
    event.preventDefault();
    if(lock.current || cooldown > 0 || stale) return;
    const normalizedPhone=normalizeCustomerPhone(phone);
    const errors:Record<string,string>={};
    if(normalizedPhone!=="+7"+"0".repeat(10)) errors["customer.phone"]="В демо используйте только +70000000000.";
    if(name.trim().length>80) errors["customer.name"]="Не более 80 символов.";
    if(!consent) errors["consent.accepted"]="Подтвердите согласие для тестовой заявки.";
    if(website) errors["antiBot.website"]="Не удалось проверить форму.";
    if(Object.keys(errors).length) {setFieldErrors(errors);setError(Object.values(errors).join(" ")); return;}
    const body:EstimateLeadRequest={
      siteKey:config.id,configVersion:config.contentVersion,kind:"estimate",parameters,
      customer:{phone:normalizedPhone!,...(name.trim()?{name:name.trim()}:{})},
      consent:{accepted:true,version:config.legal.consentVersion},antiBot:{website:""},
    };
    const serial=JSON.stringify(body);
    if(!attempt.current || attempt.current.body!==serial) attempt.current={body:serial,key:generateUUID()};
    const key=attempt.current.key;
    lock.current=true;setPending(true);setError("");setFieldErrors({});
    const active=new AbortController();controller.current=active;
    try {
      const result=await submitLead(body,{endpoint:"/api/estimates",idempotencyKey:key,signal:active.signal});
      if(controller.current!==active)return;
      setReceipt(result.receipt);setStage("receipt");
    } catch (failure) {
      if(controller.current!==active || active.signal.aborted)return;
      const e=failure instanceof SubmitError ? failure : null;
      if(e?.httpStatus===409) {
        setStale(true);attempt.current=null;setConsent(false);
        setError("Условия расчёта или согласия изменились. Сохраните нужные параметры и обновите страницу, чтобы пересчитать заявку.");
      } else if(e?.httpStatus===429) {
        setCooldown(Math.min(3600,e.retryAfterSeconds??60));
        setError("Слишком много попыток. Дождитесь окончания паузы перед повтором.");
      } else if(e?.httpStatus===422) {
        attempt.current=null;setFieldErrors(e.fieldErrors??{});setError("Проверьте отмеченные поля.");
        if (Object.keys(e.fieldErrors??{}).some(path=>path.startsWith("parameters"))) setStage("parameters");
      } else if(e?.kind==="invalid-response") {
        setError("Не удалось подтвердить сохранение. Получен некорректный ответ; повторите отправку.");
      } else {
        setError("Не удалось подтвердить сохранение заявки. Проверьте соединение и попробуйте ещё раз. При повторе неизменённой заявки дубль не создаётся.");
      }
    } finally {
      if(controller.current===active) {lock.current=false;setPending(false);controller.current=null;}
    }
  }

  return <div className="estimate-flow" data-testid="estimate-flow">
    <ol className="estimate-progress" aria-label="Этапы расчёта">
      {["Параметры","Расчёт","Заявка"].map((label,index)=><li key={label} aria-current={index===(stage==="parameters"?0:stage==="quote"?1:2)?"step":undefined}><span>0{index+1}</span>{label}</li>)}
    </ol>
    {stage==="parameters" && <form onSubmit={calculate} noValidate className="estimate-parameters">
      <div>
        <h2 ref={heading} tabIndex={-1}>Свет начинается с деталей.</h2>
        <p className="estimate-description">Задайте конструкцию. Все ставки демонстрационные, цена обновляется при изменении параметров.</p>
        <label>Тип конструкции<select value={parameters.product} onChange={e=>setOption("product",e.target.value as WindowParameters["product"])}><option value="window">Окно</option><option value="balcony-door">Балконная дверь</option></select></label>
        <div className="estimate-input-pair">
          <label>Ширина, мм<input type="number" inputMode="numeric" min="600" max="2400" step="100" value={width} onChange={e=>{setWidth(e.target.value);setFieldErrors({});}} aria-invalid={!!fieldErrors["parameters.widthMm"]} aria-describedby="estimate-dimensions" /></label>
          <label>Высота, мм<input type="number" inputMode="numeric" min="600" max="2400" step="100" value={height} onChange={e=>{setHeight(e.target.value);setFieldErrors({});}} aria-invalid={!!fieldErrors["parameters.heightMm"]} aria-describedby="estimate-dimensions" /></label>
        </div>
        <p id="estimate-dimensions" className="estimate-hint">От 600 до 2400 мм, шаг 100 мм. Количество — от 1 до 6.</p>
        <div className="estimate-input-pair">
          <label>Стеклопакет<select value={parameters.glazing} onChange={e=>setOption("glazing",e.target.value as WindowParameters["glazing"])}><option value="double">Двухкамерный · базовый</option><option value="triple">Усиленный · с доплатой</option></select></label>
          <label>Цвет профиля<select value={parameters.finish} onChange={e=>setOption("finish",e.target.value as WindowParameters["finish"])}><option value="white">Белый</option><option value="graphite">Графит</option></select></label>
        </div>
        <div className="estimate-input-pair estimate-options">
          <label>Количество конструкций<input type="number" inputMode="numeric" min="1" max="6" step="1" value={quantity} onChange={e=>{setQuantity(e.target.value);setFieldErrors({});}} aria-invalid={!!fieldErrors["parameters.quantity"]} /></label>
          <label className="estimate-check"><input type="checkbox" checked={parameters.installation} onChange={e=>setOption("installation",e.target.checked)} />Включить монтаж</label>
        </div>
        {Object.keys(fieldErrors).length>0 && <div className="estimate-error" role="alert" data-testid="estimate-parameters-error">{Object.values(fieldErrors).map(text=><p key={text}>{text}</p>)}</div>}
        <button className="prototype-button" type="submit" data-testid="estimate-calculate">Посмотреть расчёт<span aria-hidden="true">↗</span></button>
      </div>
      <aside className="estimate-preview">
        <span className="prototype-kicker">Ваша конструкция · схема</span>
        <WindowDrawing parameters={parsed.ok?parsed.value:parameters} />
        <div><span>Предварительно</span><output data-testid="estimate-live-total">{parsed.ok?formatAmount(quote.totalMinor)+" ₽":"Проверьте параметры"}</output></div>
        <p>Схема условная. Точные размеры и комплектацию подтверждают после замера.</p>
      </aside>
    </form>}
    {stage==="quote" && <div className="estimate-result">
      <div><p className="prototype-kicker">Состав без мелкого шрифта</p><h2 ref={heading} tabIndex={-1}>Вот из чего складывается цена.</h2>
        <p className="estimate-description">{parameters.product==="window"?"Окно":"Балконная дверь"} · {parameters.widthMm} × {parameters.heightMm} мм · {parameters.quantity} шт.</p>
        <dl className="estimate-breakdown">{quote.breakdown.map(line=><div key={line.code}><dt>{line.label}</dt><dd>{formatAmount(line.amountMinor)} ₽</dd></div>)}</dl>
        <div className="estimate-total"><span>Предварительный итог</span><strong data-testid="estimate-quote-total">{formatAmount(quote.totalMinor)} ₽</strong></div>
        <div className="estimate-actions"><button className="prototype-button" data-testid="estimate-to-contact" onClick={()=>{setStage("contact");setError("");}}>Уточнить после замера ↗</button><button className="estimate-text-button" data-testid="estimate-edit" onClick={()=>setStage("parameters")}>Изменить параметры</button></div>
      </div>
      <aside className="estimate-assumptions"><WindowDrawing parameters={parameters}/><h3>Расчёт — начало разговора.</h3>{quote.assumptions.map(text=><p key={text}>{text}</p>)}</aside>
    </div>}
    {stage==="contact" && <form onSubmit={send} noValidate className="estimate-contact">
      <div>
        <h2 ref={heading} tabIndex={-1}>Уточним ваш проект.</h2>
        <p className="estimate-description">В демо сохраняется тестовая заявка с расчётом. Настоящие контакты не вводите; выезд на замер не назначается.</p>
        <fieldset disabled={pending||stale}>
          <label>Тестовый телефон<input type="tel" autoComplete="off" maxLength={32} value={phone} onChange={e=>{setPhone(e.target.value);clearContactError();}} data-testid="estimate-phone" aria-invalid={!!fieldErrors["customer.phone"]} aria-describedby={fieldErrors["customer.phone"]?"estimate-phone-error":"estimate-phone-hint"} /></label>
          {fieldErrors["customer.phone"] && <p id="estimate-phone-error" className="estimate-field-error" data-testid="estimate-phone-error">{fieldErrors["customer.phone"]}</p>}
          <p className="estimate-hint" id="estimate-phone-hint">Только +70000000000. <button className="estimate-text-button" type="button" onClick={()=>{setPhone("+7"+"0".repeat(10));clearContactError();}}>Подставить тестовый</button></p>
          <label>Имя для примера · необязательно<input type="text" autoComplete="off" maxLength={80} value={name} onChange={e=>{setName(e.target.value);clearContactError();}} data-testid="estimate-name" aria-invalid={!!fieldErrors["customer.name"]}/></label>
          {fieldErrors["customer.name"] && <p className="estimate-field-error">{fieldErrors["customer.name"]}</p>}
          <div className="estimate-honeypot" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e=>setWebsite(e.target.value)}/></label></div>
          <label className="estimate-check estimate-consent"><input type="checkbox" checked={consent} onChange={e=>{setConsent(e.target.checked);clearContactError();}} data-testid="estimate-consent" /><span>Согласен с <Link href={config.legal.policyPath}>условиями демонстрационной обработки</Link>. Использую синтетические данные.</span></label>
        </fieldset>
        {error && <div className="estimate-error" role="alert" data-testid="estimate-error">{error}</div>}
        <div className="estimate-actions">
          <button className="prototype-button" type="submit" disabled={pending||cooldown>0||stale} data-testid="estimate-submit">{pending?"Сохраняем…":cooldown>0?"Повтор через "+cooldown+" с":"Отправить тестовую заявку ↗"}</button>
          <button className="estimate-text-button" type="button" disabled={pending} onClick={()=>setStage("quote")}>Вернуться к расчёту</button>
        </div>
        <p className="estimate-hint" aria-live="polite">{pending?"Дождитесь квитанции.":cooldown>0?"Повтор станет доступен через "+cooldown+" с.":""}</p>
      </div>
      <aside className="estimate-contact-summary"><p className="prototype-kicker">Ваш предварительный расчёт</p><strong>{formatAmount(quote.totalMinor)} ₽</strong><p>{parameters.widthMm} × {parameters.heightMm} мм · {parameters.quantity} шт.</p><p>В заявке сохранятся выбранные параметры и предварительный расчёт. Изображение и ставки демонстрационные.</p></aside>
    </form>}
    {stage==="receipt" && receipt && <div className="estimate-receipt" role="status">
      <span className="estimate-receipt-mark" aria-hidden="true">✓</span>
      <h2 ref={heading} tabIndex={-1}>Тестовая заявка сохранена.</h2>
      <p>{receipt.message}</p><p>Номер: <code data-testid="estimate-lead-id">{receipt.leadId}</code></p>
      <p>Это квитанция сохранения, а не подтверждение заказа, доставки или замера.</p>
      <button className="prototype-button" onClick={()=>{attempt.current=null;setReceipt(null);setPhone("");setName("");setConsent(false);setStage("parameters");setError("");setFieldErrors({});}}>Новый расчёт ↗</button>
    </div>}
  </div>;
}
