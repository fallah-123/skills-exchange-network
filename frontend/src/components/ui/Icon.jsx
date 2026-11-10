// Small decorative interface icons; accessible names stay on their controls.
const paths = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  discover: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5',
  matches: 'M8 3H4v4 M16 21h4v-4 M4 7l5 5-5 5 M20 17l-5-5 5-5 M9 12h6',
  requests: 'M4 4h16v16H4z M8 8h8 M8 12h5 M8 16h3',
  messages: 'M4 4h16v12H9l-5 4V4z M8 8h8 M8 12h5',
  skills: 'M8 5L2 12l6 7 M16 5l6 7-6 7 M14 3l-4 18',
  profile: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M4 21v-3a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v3',
  arrow: 'M4 12h16 M14 6l6 6-6 6',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
};
export default function Icon({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name] || paths.arrow} /></svg>;
}
