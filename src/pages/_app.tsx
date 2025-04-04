import '../styles/globals.css';
import '../styles/collaborative-editor.css';
import type { AppProps } from 'next/app';
import { TenantProvider } from '../context/TenantContext';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <TenantProvider>
      <Component {...pageProps} />
    </TenantProvider>
  );
}

export default MyApp;