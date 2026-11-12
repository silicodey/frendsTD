const svg = (body: string, vb = '0 0 24 24') => `<svg viewBox="${vb}" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  core: svg('<path d="M12 2l8 5v10l-8 5-8-5V7z" fill="currentColor" fill-opacity=".18"/><path d="M12 7l4 2.5v5L12 17l-4-2.5v-5z" fill="currentColor"/>'),
  token: svg('<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".18"/><path d="M12 6.5l4.5 3.2-1.7 5.3H9.2L7.5 9.7z" fill="currentColor" stroke="none"/>'),
  play: svg('<path d="M7 4.5v15l13-7.5z" fill="currentColor"/>'),
  pause: svg('<path d="M8 5v14M16 5v14" stroke-width="3.2"/>'),
  ff: svg('<path d="M3 5v14l9-7zM13 5v14l9-7z" fill="currentColor" stroke-width="1.2"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor" fill-opacity=".2"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
  star: svg('<path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.500 9.5l6.600-.9z" fill="currentColor" stroke-width="1"/>'),
  up: svg('<path d="M12 19V6M6 11l6-6 6 6" stroke-width="2.6"/>'),
  sell: svg('<path d="M4 12l8-8h8v8l-8 8z" fill="currentColor" fill-opacity=".18"/><circle cx="15.500" cy="8.500" r="1.500" fill="currentColor"/>'),
  target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  sound: svg('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" fill-opacity=".2"/><path d="M16.500 8.500a5 5 0 010 7M19 6a8.500 8.500 0 010 12"/>'),
  music: svg('<path d="M9 18V5l11-2v13"/><circle cx="6.500" cy="18" r="2.500" fill="currentColor"/><circle cx="17.500" cy="16" r="2.500" fill="currentColor"/>'),
  swords: svg('<path d="M4 4l10 10M4 4v4M4 4h4M20 4L10 14M20 4v4M20 4h-4M5 19l4-4M19 19l-4-4"/>'),
  book: svg('<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" fill="currentColor" fill-opacity=".15"/><path d="M4 21V5M9 7h6"/>'),
  restart: svg('<path d="M4 12a8 8 0 108-8H7M7 4l-3 3 3 3"/>'),
  skull: svg('<path d="M5 11a7 7 0 0114 0v4l-2 1v3H7v-3l-2-1z" fill="currentColor" fill-opacity=".2"/><circle cx="9.500" cy="11.500" r="1.300" fill="currentColor"/><circle cx="14.500" cy="11.500" r="1.300" fill="currentColor"/>'),
};
