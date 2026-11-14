import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './css/index.css';
import App from './App.jsx';
import { installRequestTracking, SlowRequestNotice } from './util/slowRequests';

// Show what the user is waiting for when a request takes more than 3 s.
installRequestTracking();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <SlowRequestNotice />
  </StrictMode>,
)
