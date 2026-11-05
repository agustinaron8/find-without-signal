import { Route, Routes } from 'react-router-dom';
import UpdateToast from './components/UpdateToast';
import Home from './pages/Home';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="*" element={<Home />} />
      </Routes>
      <UpdateToast />
    </>
  );
}
