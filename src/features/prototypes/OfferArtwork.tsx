import Image from "next/image";
import { getOfferMedia } from "./media";

export function OfferArtwork({siteKey,serviceId,index}:{siteKey:string;serviceId:string;index:number}) {
  const photo = getOfferMedia(siteKey,serviceId)?.photos[0];
  if (photo) return <div className="prototype-service-photo">
    <Image src={photo.src} alt={photo.alt} width={photo.width} height={photo.height}
      sizes="(max-width: 700px) 82vw, (max-width: 1600px) 40vw, 610px" />
  </div>;
  return <div className={"prototype-service-art art-" + index} aria-hidden="true">
    <span>{siteKey === "medical" ? "+" : siteKey === "beauty" ? "✳" : "↗"}</span>
  </div>;
}
