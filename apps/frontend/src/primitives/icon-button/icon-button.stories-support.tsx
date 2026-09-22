const paths = {
  home: "m3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7",
  threads: "M4 4h16v12H9l-5 4V4Zm4 4h8M8 12h5",
  groups: "M3 8h18v12H3V8Zm3 0V4h5l2 4",
  members:
    "M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 9v-2a6 6 0 0 1 12 0v2m2-15a4 4 0 0 1 0 8m1 2a5 5 0 0 1 5 5",
  settings: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6",
  plus: "M12 4v16M4 12h16",
  search: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 6 6",
  bell: "M6 16V9a6 6 0 0 1 12 0v7l2 2H4l2-2Zm4 5h4",
  account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0",
} as const;
/** Workshop glyphs supplied as children, not a production icon catalog. */
export function DemoIcon(props: { name: keyof typeof paths }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[props.name]} />
    </svg>
  );
}
