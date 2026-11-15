"use client";
import { useRouter } from "next/navigation";
import { BookingFlow } from "../../booking/ui/BookingFlow";
import { basePath, siteConfig } from "../content";

export function BookingExperience({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  return (
    <div className="dt-booking theme-technical site-booking-flow">
      <BookingFlow
        config={siteConfig}
        initialServiceId={serviceId}
        startAtPreference
        onReturnToLanding={() => router.push(basePath + "/services")}
      />
    </div>
  );
}
