import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import './css/App.css';
import MainLayout from './components/MainLayout';
import HomeScreen from './Pages/BomPage/BomsPage';
import BomDetailsPage from './Pages/subpages/Bom/BomDetailsPage';
import WorkOrderDetailsPage from './Pages/subpages/WorkOrder/WorkOrderDetailsPage';
import PartsSearchPage from './Pages/searchPartsPage/SearchPartsPage';
import WorkOrdersPage from './Pages/WorkordersPage/WorkOrderPage';
import TelemetryPage from './Pages/Telemetry/TelemetryPage';

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
