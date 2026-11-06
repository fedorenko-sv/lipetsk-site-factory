/* eslint-disable @next/next/no-img-element -- The image and its registration overlay share the exact same viewBox. */
const media = "/demo-assets/detailing/";

// Optical registration on the 1920 × 1080 front plate, in image coordinates.
// Never stretch the SVG or place hit targets relative to the surrounding layout.
// Crop of the original plate, in the same pixel coordinate system as the contours.
export const crop = { left: 280, top: 325, width: 1620, height: 710 };
export function markerPosition(x: number, y: number) {
  return {
    left: ((x * 19.2 - crop.left) / crop.width) * 100 + "%",
    top: ((y * 10.8 - crop.top) / crop.height) * 100 + "%",
  };
}
const contours: Record<string, string[]> = {
  front: [
    "M454 695Q502 614 638 587Q805 570 892 566Q992 568 1086 588Q929 598 850 625L746 689Q626 683 454 695Z",
    "M394 731Q422 714 453 711Q529 704 678 717L732 755Q759 814 723 866L951 878 978 906Q664 923 396 891L384 868Q381 797 394 731Z",
  ],
  body: [
    "M454 695Q502 614 638 587Q805 570 892 566Q992 568 1086 588Q929 598 850 625L746 689Q626 683 454 695Z",
    "M1318 586Q1455 599 1596 570Q1636 616 1614 698L1576 800Q1564 825 1500 837L1316 850Q1306 825 1311 778L1324 654Z",
    "M1646 556Q1716 563 1814 598L1839 638 1843 673Q1822 623 1762 629Q1726 637 1701 683L1620 703Q1644 631 1625 594Z",
  ],
  wheels: [
    "M1104 669C1162 656 1207 710 1204 795C1202 871 1161 941 1107 946C1054 946 1019 896 1020 823C1022 750 1050 687 1104 669Z",
    "M1759 660C1803 642 1831 689 1825 753C1825 811 1794 884 1756 891C1720 889 1703 855 1705 795C1710 734 1727 679 1759 660Z",
  ],
  interior: [
    "M934 563Q1014 482 1119 460Q1248 439 1373 459L1307 569Q1140 577 934 563Z",
    "M1350 566Q1398 481 1442 477Q1541 473 1625 525Q1609 556 1546 565L1350 576Z",
  ],
};
export function ZonePlate({ id }: { id: string }) {
  return (
    <svg
      className="dt-zone-ink"
      viewBox={[crop.left, crop.top, crop.width, crop.height].join(" ")}
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="dt-panel-hatch"
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(34)"
        >
          <path d="M0 0v14" stroke="#ffe4b7" strokeWidth="2.2" opacity=".55" />
        </pattern>
      </defs>
      {Object.entries(contours).map(([zone, paths]) => (
        <g key={zone} data-panel={zone} data-selected={zone === id}>
          {paths.map((path) => (
            <g key={path}>
              <path d={path} fill="#df7956" fillOpacity=".28" />
              <path
                d={path}
                fill="url(#dt-panel-hatch)"
                stroke="#ffcb94"
                strokeWidth="2.8"
                strokeLinejoin="round"
              />
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

export function Closeup({
  zoneId,
  name,
  open,
  visited,
}: {
  zoneId: string;
  name: string;
  open: boolean;
  visited: boolean;
}) {
  const image = (
    { front: "craft", body: "paint", wheels: "wheel", interior: "interior" } as Record<
      string,
      string
    >
  )[zoneId];
  return (
    <div className="dt-detail-shot" data-open={open} aria-hidden={!open}>
      {visited && (
        <img
          key={image}
          src={media + image + ".webp"}
          alt={"Крупный план: " + name}
          width="1440"
          height="810"
          loading={open ? "eager" : "lazy"}
        />
      )}
    </div>
  );
}

export function AtelierMark() {
  return (
    <svg
      className="dt-mark"
      viewBox="0 0 48 48"
      width="46"
      height="46"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M5 32C9 17 22 8 42 6C40 23 29 37 9 42C10 28 21 16 36 12" />
        <path d="M6 36C13 24 24 17 35 14M14 40C27 35 37 25 41 12" />
      </g>
    </svg>
  );
}
