import './globals.css';
import { SITE_NAME, SITE_DESCRIPTION, SITE_URL } from '../site.config.mjs';
import { LangProvider } from '../lib/i18n.jsx';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';

export const metadata = {
  title: { default: SITE_NAME, template: `%s — ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  openGraph: { title: SITE_NAME, description: SITE_DESCRIPTION, type: 'website' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <LangProvider>
          <Header />
          <main>{children}</main>
          <Footer />
        </LangProvider>
      </body>
    </html>
  );
}
