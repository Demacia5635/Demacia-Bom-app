import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import './css/App.css';
import { lazy } from 'react';
import MainLayout from './components/MainLayout';

// Each page is loaded when first opened (MainLayout shows "Loading..." meanwhile),
// so opening one page doesn't download the others, /tele included.
const HomeScreen = lazy(() => import('./Pages/BomPage/BomsPage'));
const BomDetailsPage = lazy(() => import('./Pages/subpages/Bom/BomDetailsPage'));
const WorkOrderDetailsPage = lazy(() => import('./Pages/subpages/WorkOrder/WorkOrderDetailsPage'));
const PartsSearchPage = lazy(() => import('./Pages/searchPartsPage/SearchPartsPage'));
const WorkOrdersPage = lazy(() => import('./Pages/WorkordersPage/WorkOrderPage'));
const TelemetryPage = lazy(() => import('./Pages/Telemetry/TelemetryPage'));

// The assembly BOM itself lives in the Chrome extension (src/extension);
// the website shows what has been published to the database.
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/bom/:bomId" element={<BomDetailsPage />} />
          <Route path="/workorders" element={<WorkOrdersPage />} />
          <Route path="/workOrder/:workOrderID" element={<WorkOrderDetailsPage />} />
          {/* Same page in two modes; the keys keep their search boxes separate. */}
          <Route path="/partSearch" element={<PartsSearchPage key="made" />} />
          <Route path="/standardParts" element={<PartsSearchPage key="standard" standard />} />
          {/* Onshape footprint - unlisted on purpose (not in the sidebar). */}
          <Route path="/tele" element={<TelemetryPage />} />
          {/* A mistyped address goes to Home, and the address bar says so. */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
