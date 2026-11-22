
import type { OfferPhoto } from "./media";

const photo = (folder: string, file: string, caption: string, alt: string): OfferPhoto => ({
  src: "/demo-assets/editorial/" + folder + "/" + file + ".webp",
  alt, caption, width: 480, height: 480,
});

export const editorialPhotos = {
  auto: {
    "tire-change": photo("auto", "tire-change", "Установка колеса", "Мастер устанавливает колесо на автомобиль в рабочей зоне"),
    balancing: photo("auto", "balancing", "Проверка на стенде", "Колесо на балансировочном стенде"),
    storage: photo("auto", "storage", "Стеллажи для комплектов", "Колёса на стеллажах в помещении хранения"),
    tread: photo("auto", "tread", "Осмотр протектора", "Рука в перчатке у протектора шины"),
    torque: photo("auto", "torque", "Контроль крепления", "Инструмент у крепления колеса"),
    wheels: photo("auto", "wheels", "Комплект из четырёх колёс", "Колёса в рабочей зоне сервиса"),
  },
  beauty: {
    haircut: photo("beauty", "haircut", "Форма и длина", "Стрижка до плеч с мягкими слоями, вид сзади"),
    manicure: photo("beauty", "manicure", "Короткая форма и спокойный оттенок", "Короткие ногти с нюдовым покрытием на фоне светлого камня"),
    "master-a": photo("beauty", "master-a", "Алина, вымышленный профиль", "Стилизованный фотопортрет мастера стрижек"),
    "master-b": photo("beauty", "master-b", "Лера, вымышленный профиль", "Стилизованный фотопортрет мастера маникюра"),
    "hair-tools": photo("beauty", "hair-tools", "Место мастера стрижек", "Расчёска и ножницы на столе у зеркала"),
    "nail-tools": photo("beauty", "nail-tools", "Выбор оттенка", "Образцы оттенков и инструменты на столе для маникюра"),
  },
  medical: {
    consultation: photo("medical", "consultation", "Кабинет для разговора", "Светлый кабинет со столом и стульями"),
    "checkup-info": photo("medical", "checkup-info", "Подготовка к разговору", "Стол в кабинете с чистой бумагой и ручкой"),
    "doctor-demo": photo("medical", "doctor-demo", "Марина, вымышленный профиль", "Стилизованный портрет специалиста в светлом кабинете"),
    waiting: photo("medical", "waiting", "Зона ожидания", "Места для ожидания с голубыми стульями"),
    corridor: photo("medical", "corridor", "Проход к кабинетам", "Светлый коридор с матовым стеклом и открытой дверью"),
    access: photo("medical", "access", "Проход в зоне ожидания", "Свободный проход между стеной и сиденьями"),
  },
  sports: {
    "kids-trial": photo("sports", "kids-trial", "Задания на равновесие", "Дети проходят простую полосу из мягких блоков в зале"),
    "teens-trial": photo("sports", "teens-trial", "Работа с метками", "Подростки выполняют упражнение с конусами в зале"),
    "adult-trial": photo("sports", "adult-trial", "Разминка для взрослых", "Взрослые выполняют упражнения в светлом зале"),
    "coach-kids": photo("sports", "coach-kids", "Ольга, вымышленный профиль", "Стилизованный портрет тренера детской группы"),
    "coach-teens": photo("sports", "coach-teens", "Антон, вымышленный профиль", "Стилизованный портрет тренера подростковой группы"),
    "coach-adult": photo("sports", "coach-adult", "Ирина, вымышленный профиль", "Стилизованный портрет тренера взрослой группы"),
  },
  stay: {
    "pine-terrace": photo("stay", "pine-terrace", "Терраса «Сосны»", "Стол и два стула на деревянной террасе среди сосен"),
    "pine-reading": photo("stay", "pine-reading", "Уголок для чтения", "Кресло на фоне наклонной деревянной стены лесного дома"),
    "forest-terrace": photo("stay", "forest-terrace", "Терраса «Лесного»", "Крытая терраса тёмного дома среди сосен"),
    "forest-view": photo("stay", "forest-view", "Лес из гостиной", "Сосны за широким окном тёмного деревянного дома"),
    trail: photo("stay", "trail", "Тропа среди сосен", "Тропинка в сосновом лесу в утреннем свете"),
    table: photo("stay", "table", "Завтрак у окна", "Керамические чашки на льняной скатерти у окна в лес"),
  },
  estimate: {
    window: photo("estimate", "window", "Белый профиль", "Белое двухстворчатое окно в светлой комнате"),
    "balcony-door": photo("estimate", "balcony-door", "Дверь на балкон", "Остеклённая дверь и выход на балкон"),
    frame: photo("estimate", "frame", "Примыкание створки", "Угол белой оконной створки и стеклопакет"),
    graphite: photo("estimate", "graphite", "Графит в интерьере", "Графитовое окно на фоне светлого жилого интерьера"),
    measure: photo("estimate", "measure", "Обмер проёма", "Мастер с рулеткой у оконного проёма"),
    glass: photo("estimate", "glass", "Стекло и уплотнение", "Кромка стеклопакета рядом с профилем и уплотнением"),
  },
  detailing: {
    "ppf-front": photo("detailing", "ppf-front", "Укладка плёнки на капот", "Прозрачная плёнка на капоте графитового купе"),
    "ppf-full": photo("detailing", "ppf-full", "Работа с задним крылом", "Мастер разглаживает защитный материал у колёсной арки"),
    ceramic: photo("detailing", "ceramic", "Нанесение покрытия", "Аппликатор на лаке графитового автомобиля"),
    polish: photo("detailing", "polish", "Пробный участок полировки", "Руки мастера с полировальной машинкой у кузова"),
    "wheel-care": photo("detailing", "wheel-care", "Очистка диска", "Щётка на фоне графитового легкосплавного диска"),
    "interior-care": photo("detailing", "interior-care", "Детали салона", "Мягкая щётка рядом с простроченной кожей в салоне"),
  },
};

export function getEditorialPhoto(siteKey: keyof typeof editorialPhotos, key: string) {
  const group: Record<string, OfferPhoto> = editorialPhotos[siteKey];
  return group[key];
}
