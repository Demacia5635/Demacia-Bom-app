import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { lazy } from 'react';
import MainLayout from './components/MainLayout';
import AdminGate from './components/AdminGate';

// Each page is loaded when first opened (MainLayout shows "Loading..." meanwhile),
// so opening one page doesn't download the others, /tele included.
const BomsPage = lazy(() => import('./Pages/BomPage/BomsPage'));
const BomDetailsPage = lazy(() => import('./Pages/Subpages/Bom/BomDetailsPage'));
const WorkOrderDetailsPage = lazy(() => import('./Pages/Subpages/WorkOrder/WorkOrderDetailsPage'));
const PartsSearchPage = lazy(() => import('./Pages/SearchPartsPage/SearchPartsPage'));
const WorkOrdersPage = lazy(() => import('./Pages/WorkOrdersPage/WorkOrderPage'));
const TelemetryPage = lazy(() => import('./Pages/Telemetry/TelemetryPage'));
const WhatsNewPage = lazy(() => import('./Pages/WhatsNew/WhatsNewPage'));
const OrphansPage = lazy(() => import('./Pages/Orphans/OrphansPage'));
const HealthPage = lazy(() => import('./Pages/Health/HealthPage'));
const AdminPage = lazy(() => import('./Pages/Admin/AdminPage'));
const ServerPage = lazy(() => import('./Pages/Server/ServerPage'));
const ProductionPage = lazy(() => import('./Pages/Production/ProductionPage'));

// A new id in the address is a new page (key): nothing of the previous BOM or
// work order stays in its state, so the pages don't reset it by hand.
function BomRoute() {
  const { bomId } = useParams();
  return <BomDetailsPage key={bomId} />;
}
function WorkOrderRoute() {
  const { workOrderID } = useParams();
  return <WorkOrderDetailsPage key={workOrderID} />;
}

// The assembly BOM itself lives in the Chrome extension (src/extension);
// the website shows what has been published to the database.
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<BomsPage />} />
          <Route path="/home" element={<BomsPage />} />
          <Route path="/bom/:bomId" element={<BomRoute />} />
          <Route path="/workorders" element={<WorkOrdersPage />} />
          <Route path="/workOrder/:workOrderID" element={<WorkOrderRoute />} />
          {/* Same page in two modes; the keys keep their search boxes separate. */}
          <Route path="/partSearch" element={<PartsSearchPage key="made" />} />
          <Route path="/standardParts" element={<PartsSearchPage key="standard" standard />} />
          {/* Onshape footprint - unlisted on purpose (not in the sidebar). */}
          <Route path="/tele" element={<AdminGate><TelemetryPage /></AdminGate>} />
          {/* Parts no assembly uses, with Delete (admin) - unlisted too. */}
          <Route path="/orphans" element={<AdminGate><OrphansPage /></AdminGate>} />
          {/* Data health: problems in the saved parts and BOMs - unlisted too. */}
          <Route path="/health" element={<AdminGate><HealthPage /></AdminGate>} />
          {/* Unlocks the admin pages in this browser's sidebar - unlisted until then. */}
          <Route path="/admin" element={<AdminPage />} />
          {/* Admin pages (sidebar's ADMIN section); their data needs the admin secret. */}
          <Route path="/server" element={<AdminGate needsSecret><ServerPage /></AdminGate>} />
          <Route path="/production" element={<AdminGate needsSecret><ProductionPage /></AdminGate>} />
          <Route path="/whatsnew" element={<WhatsNewPage />} />
          {/* A mistyped address goes to Home, and the address bar says so. */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
