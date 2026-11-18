import type { WindowParameters } from "@/shared/estimate-contracts";

export function WindowDrawing({ parameters: p }: { parameters: WindowParameters }) {
  const height = p.product === "balcony-door" ? 210 : 155;
  const width = Math.max(95, Math.min(200, p.widthMm / p.heightMm * height));
  const x = (280 - width) / 2;
  const y = (240 - height) / 2;
  return <svg className={"estimate-drawing " + (p.finish === "graphite" ? "is-graphite" : "")} viewBox="0 0 280 260" role="img" aria-label={`Схема: ${p.product === "window" ? "окно" : "балконная дверь"}, ${p.widthMm} на ${p.heightMm} мм`}>
    <defs><linearGradient id="estimate-glass" x2="1" y2="1"><stop stopColor="#c4dce2"/><stop offset=".5" stopColor="#eff7f6"/><stop offset="1" stopColor="#bdd2dc"/></linearGradient></defs>
    <path d="M0 240H280M40 0V260M240 0V260" stroke="currentColor" opacity=".1" />
    <rect className="estimate-frame" x={x} y={y} width={width} height={height} rx="1" strokeWidth="8" />
    <rect x={x+8} y={y+8} width={width-16} height={height-16} fill="url(#estimate-glass)" />
    <path d={`M${x+width*.5} ${y+4}V${y+height-4}`} className="estimate-frame" strokeWidth="7" />
    <path d={`M${x+width*.5+8} ${y+height*.46}v15`} stroke="#657888" strokeWidth="3" />
    <path d={`M${x+14} ${y+height-14}L${x+width*.5-10} ${y+14}`} stroke="white" strokeWidth="2" opacity=".7" />
    <path d={`M${x} 235h${width}M${x} 230v10M${x+width} 230v10`} stroke="currentColor" strokeWidth=".7" />
    <text x="140" y="254" textAnchor="middle" fill="currentColor" fontSize="9">{p.widthMm} мм</text>
    <text x="268" y="135" textAnchor="middle" fill="currentColor" fontSize="9" transform="rotate(-90,268,135)">{p.heightMm} мм</text>
  </svg>;
}
