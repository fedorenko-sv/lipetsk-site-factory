export interface OfferPhoto {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}

export interface OfferMedia {
  title: string;
  photos: readonly OfferPhoto[];
}

const stayMedia: Record<string, OfferMedia> = {
  "pine-house": {
    title: "Дом у сосен",
    photos: [
      {src:"/demo-assets/prototypes/stay.webp",alt:"Треугольный дом у сосен с тёплым светом в окнах",caption:"Снаружи",width:1600,height:900},
      {src:"/demo-assets/prototypes/stay/pine-interior.webp",alt:"Треугольное остекление A-frame, светлое дерево и вид на сосны",caption:"Интерьер A-frame",width:1536,height:1024},
    ],
  },
  "forest-house": {
    title: "Панорамный дом",
    photos: [
      {src:"/demo-assets/prototypes/stay/forest-exterior.webp",alt:"Панорамный дом из тёмного дерева среди сосен",caption:"Снаружи",width:1536,height:1024},
      {src:"/demo-assets/prototypes/stay/forest-interior.webp",alt:"Гостиная панорамного дома с широким окном в лес",caption:"Панорамная гостиная",width:1536,height:1024},
    ],
  },
};

export function getOfferMedia(siteKey: string, serviceId: string): OfferMedia | null {
  return siteKey === "stay" && Object.hasOwn(stayMedia, serviceId) ? stayMedia[serviceId] : null;
}
