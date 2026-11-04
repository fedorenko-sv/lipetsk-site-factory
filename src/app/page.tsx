import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-16 max-w-xl mx-auto">
      <div className="mb-4 inline-block px-2.5 py-1 text-xs font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
        Lipetsk Site Factory
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-white mb-3">
        Демонстрационные проекты
      </h1>
      <p className="text-[#9ca3af] mb-8 leading-relaxed">
        Витрина типовых решений для малого бизнеса: автосервис, шиномонтаж и запись на услуги.
      </p>

      <div className="space-y-3">
        <Link
          href="/demo/auto"
          className="block p-5 rounded-xl bg-[#181a1f] border border-[#2a2e37] hover:border-amber-400/60 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold text-white group-hover:text-amber-300 transition-colors">
                Авто · Демо
              </div>
              <div className="text-xs text-[#9ca3af] mt-1">
                Оффер и прейскурант шиномонтажа с выбором услуг
              </div>
            </div>
            <span className="text-amber-400 group-hover:translate-x-1 transition-transform">
              →
            </span>
          </div>
        </Link>
      </div>
    </main>
  );
}
