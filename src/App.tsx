import { HashRouter, Routes, Route } from 'react-router-dom';
import './css/App.css';
import MainLayout from './components/MainLayout';
import HomeScreen from './Pages/BomPage/BomsPage';
import BomDetailsPage from './Pages/subpages/Bom/BomDetailsPage';
import WorkOrderDetailsPage from './Pages/subpages/WorkOrder/WorkOrderDetailsPage';
import PartsSearchPage from './Pages/searchPartsPage/SearchPartsPage';
import WorkOrdersPage from './Pages/WorkordersPage/WorkOrderPage';

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
          <Route path="/partSearch" element={<PartsSearchPage />} />
          <Route path="*" element={<HomeScreen />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
