import { editorialPhotos as photos } from "./editorial-photos";

export interface OfferPhoto {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}

export interface OfferMedia {
  title: string;
  intro?: string;
  photos: readonly OfferPhoto[];
}

const stayMedia: Record<string, OfferMedia> = {
  "pine-house": {
    title: "Дом у сосен",
    intro: "Дом снаружи, интерьер и места для отдыха.",
    photos: [
      {src:"/demo-assets/prototypes/stay.webp",alt:"Треугольный дом у сосен с тёплым светом в окнах",caption:"Снаружи",width:1600,height:900},
      {src:"/demo-assets/prototypes/stay/pine-interior.webp",alt:"Треугольное остекление A-frame, светлое дерево и вид на сосны",caption:"Интерьер A-frame",width:1536,height:1024},
      photos.stay["pine-terrace"], photos.stay["pine-reading"],
    ],
  },
  "forest-house": {
    title: "Панорамный дом",
    intro: "Архитектура дома, панорамная гостиная и терраса.",
    photos: [
      {src:"/demo-assets/prototypes/stay/forest-exterior.webp",alt:"Панорамный дом из тёмного дерева среди сосен",caption:"Снаружи",width:1536,height:1024},
      {src:"/demo-assets/prototypes/stay/forest-interior.webp",alt:"Гостиная панорамного дома с широким окном в лес",caption:"Панорамная гостиная",width:1536,height:1024},
      photos.stay["forest-terrace"], photos.stay["forest-view"],
    ],
  },
};

const offerMedia: Record<string, Record<string, OfferMedia>> = {
  auto: {
    "tire-change": { title: "Сезонная смена шин", photos: [photos.auto["tire-change"], photos.auto.torque] },
    balancing: { title: "Балансировка", photos: [photos.auto.balancing, photos.auto.tread] },
    storage: { title: "Сезонное хранение", photos: [photos.auto.storage, photos.auto.wheels] },
  },
  beauty: {
    haircut: { title: "Стрижка", photos: [photos.beauty.haircut, photos.beauty["hair-tools"]] },
    manicure: { title: "Маникюр", photos: [photos.beauty.manicure, photos.beauty["nail-tools"]] },
  },
  medical: {
    consultation: { title: "Первичный приём", photos: [photos.medical.consultation, photos.medical.waiting] },
    "checkup-info": { title: "Консультация по обследованию", photos: [photos.medical["checkup-info"], photos.medical.corridor] },
  },
  sports: {
    "kids-trial": { title: "Детская группа", photos: [photos.sports["kids-trial"], photos.sports["coach-kids"]] },
    "teens-trial": { title: "Подростковая группа", photos: [photos.sports["teens-trial"], photos.sports["coach-teens"]] },
    "adult-trial": { title: "Группа для взрослых", photos: [photos.sports["adult-trial"], photos.sports["coach-adult"]] },
  },
  stay: stayMedia,
  estimate: {
    window: { title: "Окно", photos: [photos.estimate.window, photos.estimate.graphite, photos.estimate.frame] },
    "balcony-door": { title: "Балконная дверь", photos: [photos.estimate["balcony-door"], photos.estimate.glass] },
  },
};

export function getOfferMedia(siteKey: string, serviceId: string): OfferMedia | null {
  const group = Object.hasOwn(offerMedia, siteKey) ? offerMedia[siteKey] : undefined;
  return group && Object.hasOwn(group, serviceId) ? group[serviceId] : null;
}
