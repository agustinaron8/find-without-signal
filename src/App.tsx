import { Navigate, Route, Routes } from 'react-router-dom';
import UpdateToast from './components/UpdateToast';
import GroupDetail from './pages/GroupDetail';
import GroupEdit from './pages/GroupEdit';
import Help from './pages/Help';
import Home from './pages/Home';
import Import from './pages/Import';
import Meet from './pages/Meet';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/group/new" element={<GroupEdit />} />
        <Route path="/group/:id" element={<GroupDetail />} />
        <Route path="/group/:id/edit" element={<GroupEdit />} />
        <Route path="/group/:id/meet" element={<Meet />} />
        <Route path="/import" element={<Import />} />
        <Route path="/i" element={<Import />} />
        <Route path="/help" element={<Help />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <UpdateToast />
    </>
  );
}
