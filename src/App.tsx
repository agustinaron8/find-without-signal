import { Navigate, Route, Routes } from 'react-router-dom';
import UpdateToast from './components/UpdateToast';
import GroupDetail from './pages/GroupDetail';
import GroupEdit from './pages/GroupEdit';
import Home from './pages/Home';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/group/new" element={<GroupEdit />} />
        <Route path="/group/:id" element={<GroupDetail />} />
        <Route path="/group/:id/edit" element={<GroupEdit />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <UpdateToast />
    </>
  );
}
