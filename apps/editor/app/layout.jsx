import '../src/styles.css';

export const metadata = {
  title: 'Sherlock — QA Workspace',
  description: 'Local-first QA workspace for Claude Code',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
