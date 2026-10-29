import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SinglePhonePage } from './pages/SinglePhonePage';
import { DemoPage } from './pages/DemoPage';
import { DemoSignIn } from './components/DemoSignIn';

export default function App() {
  return (
    <BrowserRouter>
      <DemoSignIn>
        <Routes>
          <Route path="/" element={<SinglePhonePage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="*" element={<SinglePhonePage />} />
        </Routes>
      </DemoSignIn>
    </BrowserRouter>
  );
}
