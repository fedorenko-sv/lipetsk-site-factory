// Optional art build, run from the repository root with ffmpeg (libx264) on PATH.
// No network, credentials, or source PNGs needed. The site serves checked-in outputs.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const media = "public/demo-assets/detailing";
const tmp = "work/detailing-film";
mkdirSync(tmp, { recursive: true });
const shots = JSON.parse(readFileSync("src/features/detailing/film-shots.json", "utf8"));
function render(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    stdio: "inherit",
  });
  if (result.error || result.status !== 0)
    throw result.error ?? Error("ffmpeg exited " + result.status);
}
const movements = [
  ["1+0.064*(1-cos(on*PI/120))/2", ".64", ".69"],
  ["1.094-0.074*(1-cos(on*PI/120))/2", ".76", ".61"],
  ["1+0.082*(1-cos(on*PI/120))/2", ".68", ".53"],
];
const plate = (index, moving) => {
  const [zoom, x, y] = movements[index];
  const z = moving ? zoom : index === 1 ? "1.094" : "1";
  return (
    "scale=3200:1800,setsar=1,zoompan=z='" +
    z +
    "':x='(iw-iw/zoom)*" +
    x +
    "':y='(ih-ih/zoom)*" +
    y +
    "':d=" +
    (moving ? 120 : 13) +
    ":s=1920x1080:fps=24,format=yuv420p,settb=1/24"
  );
};
for (let i = 0; i < shots.length; i++) {
  const next = (i + 1) % shots.length;
  const graph =
    "[0:v]" +
    plate(i, true) +
    "[run];[1:v]" +
    plate(next, false) +
    "[still];[run][still]xfade=transition=fade:duration=0.5:offset=4.5,trim=end_frame=120,format=yuv420p[out]";
  render([
    "-i",
    path.join(media, shots[i].image),
    "-i",
    path.join(media, shots[next].image),
    "-filter_complex_threads",
    "2",
    "-filter_complex",
    graph,
    "-map",
    "[out]",
    "-an",
    "-c:v",
    "libx264",
    "-threads",
    "3",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-g",
    "24",
    path.join(tmp, "plate-" + i + ".mp4"),
  ]);
}
writeFileSync(
  path.join(tmp, "join.txt"),
  shots.map((_, i) => "file 'plate-" + i + ".mp4'").join("\n"),
);
const hd = path.join(media, "atelier-1080.mp4");
render([
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  path.join(tmp, "join.txt"),
  "-c",
  "copy",
  "-movflags",
  "+faststart",
  hd,
]);
render([
  "-i",
  hd,
  "-vf",
  "scale=1280:720",
  "-an",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-threads",
  "3",
  "-preset",
  "fast",
  "-crf",
  "27",
  "-g",
  "24",
  "-movflags",
  "+faststart",
  path.join(media, "atelier-720.mp4"),
]);
console.log("Three 5-second chapters, seam included; desktop and mobile reels ready.");
