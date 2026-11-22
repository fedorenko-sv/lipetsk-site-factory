import type { Metadata } from "next";
import { SiteHeader } from "@/features/detailing/site/SiteHeader";
import { SiteFooter } from "@/features/detailing/site/SiteFooter";
import "@/features/detailing/detailing.css";
import "@/features/detailing/art-direction.css";
import "@/features/detailing/site/site.css";
export const metadata: Metadata = {
  title: "OBLIK — детейлинг-ателье · демо",
  robots: { index: false, follow: false },
};
export default function DetailingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="detailing dt-site">
      <a className="dt-skip" href="#site-content">
        К содержимому
      </a>
      <SiteHeader />
      <div id="site-content" tabIndex={-1}>
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}
