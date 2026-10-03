import { HashRouter, Routes, Route } from 'react-router-dom';
import './css/App.css';
import MainLayout from './components/MainLayout';
import HomeScreen from './Pages/BomPage/BomsPage';
import BomDetailsPage from './Pages/subpages/Bom/BomDetailsPage';
import WorkOrderDetailsPage from './Pages/subpages/WorkOrder/WorkOrderDetailsPage';
import PartsSearchPage from './Pages/searchPartsPage/SearchPartsPage';
import AssemblyBomPage from './assembly-extension/AssemblyBomPage';
import WorkOrdersPage from './Pages/WorkordersPage/WorkOrderPage';
import SignIn from "./Pages/auth/SignIn";
import Signup from "./Pages/auth/SignUp";
import OnshapeSecretsTutorial from "./Pages/Tutorials/OnshapeSecretsTutorial";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/onshape" element={<AssemblyBomPage />} />
          <Route path="/bom/:bomId" element={<BomDetailsPage />} />
          <Route path="/workorders" element={<WorkOrdersPage />} />
          <Route path="/workOrder/:workOrderID" element={<WorkOrderDetailsPage />} />
          <Route path="/partSearch" element={<PartsSearchPage />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/onshape-secrets-tutorial" element={<OnshapeSecretsTutorial />} />
          <Route path="*" element={<HomeScreen />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}