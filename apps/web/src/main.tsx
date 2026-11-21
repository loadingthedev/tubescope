import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import './styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: false, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter basename="/app"><App /></BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
