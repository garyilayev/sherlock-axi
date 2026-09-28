import '../src/styles.css';
import { RTL_LANGS, STORAGE_KEY } from '../src/i18n/core.js';

export const metadata = {
  title: 'Sherlock — QA Workspace',
  description: 'Local-first QA workspace for Claude Code',
  icons: { icon: '/favicon.svg' },
};

// The static export is pre-rendered in English. Apply the stored language and
// direction before first paint so a Hebrew user never sees an LTR flash.
const PREPAINT = `try{var l=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(l){var d=document.documentElement;d.lang=l;d.dir=${JSON.stringify([...RTL_LANGS])}.indexOf(l)>=0?'rtl':'ltr'}}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREPAINT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
