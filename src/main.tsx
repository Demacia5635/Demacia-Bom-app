import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './css/index.css';
import App from './App';
import { setUpdatedBy } from './util/ApiService';
import { installRequestTracking } from './util/slowRequests';
import SlowRequestNotice from './util/SlowRequestNotice';

// The website's saves are marked as such on the records (updatedBy, QW22).
setUpdatedBy('website');

// Pages load on first visit (App.tsx). After a new deploy, a tab opened before it
// asks for page files that no longer exist: reload to get the new version.
window.addEventListener('vite:preloadError', () => window.location.reload());

// Show what the user is waiting for when a request takes more than 3 s.
installRequestTracking();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <SlowRequestNotice />
  </StrictMode>,
)
