import Link from "next/link";
import { autoConfig } from "@/config/sites/auto";
import { beautyConfig } from "@/config/sites/beauty";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#121316] text-[#f3f4f6]">
      <main className="max-w-xl mx-auto px-4 py-16">
        <div className="mb-4 inline-block px-2.5 py-1 text-xs font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
          Lipetsk Site Factory
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white mb-3">
          Демонстрационные проекты
        </h1>
        <p className="text-[#9ca3af] mb-8 leading-relaxed">
          Витрина типовых решений для малого бизнеса: автосервис, студия красоты и запись на услуги.
        </p>

        <div className="space-y-4">
          <Link
            href="/demo/detailing"
            className="block p-5 rounded-2xl bg-[#181a1f] border border-[#71634e] hover:border-amber-400/60 transition-colors group"
          >
            <span className="text-xs uppercase tracking-wider text-amber-200">Новый концепт · cinematic</span>
            <div className="text-lg font-bold text-white mt-2">OBLIK — детейлинг-ателье ↗</div>
            <p className="text-sm text-[#b9bdc5] mt-1">Видео автомобиля, выбор зон защиты и запись на услуги.</p>
          </Link>
          <Link
            href="/demo/auto"
            className="block p-5 rounded-2xl bg-[#181a1f] border border-[#2a2e37] hover:border-amber-400/60 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
                  {autoConfig.theme}
                </span>
                <div className="text-lg font-bold text-white group-hover:text-amber-300 transition-colors mt-2">
                  {autoConfig.brandName}
                </div>
                <div className="text-xs text-[#9ca3af] mt-1">
                  {autoConfig.hero.title}
                </div>
              </div>
              <span className="text-amber-400 text-xl font-bold group-hover:translate-x-1 transition-transform">
                →
              </span>
            </div>
          </Link>

          <Link
            href="/demo/beauty"
            className="block p-5 rounded-2xl bg-[#181a1f] border border-[#2a2e37] hover:border-amber-400/60 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-rose-300 bg-rose-900/30 px-2 py-0.5 rounded">
                  {beautyConfig.theme}
                </span>
                <div className="text-lg font-bold text-white group-hover:text-amber-300 transition-colors mt-2">
                  {beautyConfig.brandName}
                </div>
                <div className="text-xs text-[#9ca3af] mt-1">
                  {beautyConfig.hero.title}
                </div>
              </div>
              <span className="text-amber-400 text-xl font-bold group-hover:translate-x-1 transition-transform">
                →
              </span>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
