export const prototypes = [
    { id: "auto", code: "A1", name: "Технический Auto", brand: "Авто · демо", core: "booking", href: "/demo/auto", image: "/demo-assets/detailing/hero.webp", summary: "Работы с автомобилем, параметры и пожелание по времени.", extraHref: "/demo/detailing", extraLabel: "Подробный пример OBLIK" },
    { id: "beauty", code: "A2", name: "Editorial Beauty", brand: "MIRA", core: "booking", href: "/demo/beauty", image: "/demo-assets/prototypes/beauty.webp", summary: "Услуга, знакомство с мастером и удобное время." },
    { id: "medical", code: "A3", name: "Medical Trust", brand: "ЯСНО", core: "booking", href: "/demo/medical", image: "/demo-assets/prototypes/medical.webp", summary: "Направление приёма, специалист и организационная заявка." },
    { id: "sports", code: "A4", name: "Sports / Kids", brand: "ДВИЖ", core: "booking", href: "/demo/sports", image: "/demo-assets/prototypes/sports.webp", summary: "Программы по возрасту и запрос на пробное занятие." },
    { id: "stay", code: "A5", name: "Nature Stay", brand: "ТИШЕ", core: "booking", href: "/demo/stay", image: "/demo-assets/prototypes/stay.webp", summary: "Лесные дома и запрос на обсуждение поездки." },
    { id: "estimate", code: "B1", name: "Estimate / Construction", brand: "ПРОСВЕТ", core: "calculator", href: "/demo/estimate", image: "/demo-assets/prototypes/estimate.webp", summary: "Параметры окна, прозрачный расчёт и заявка на уточнение." },
] as const;
export type PrototypeId = (typeof prototypes)[number]["id"];
export function getPrototype(id: string) { return prototypes.find(p => p.id === id); }
