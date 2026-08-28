import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Overview } from './pages/Overview';
import { Agents } from './pages/Agents';
import { Chat } from './pages/Chat';
import { Sessions } from './pages/Sessions';
import { Capabilities } from './pages/Capabilities';
import { Memory } from './pages/Memory';
import { Approvals } from './pages/Approvals';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path='/' element={<Overview />} />
        <Route path='/agents' element={<Agents />} />
        <Route path='/agents/:id' element={<Chat />} />
        <Route path='/sessions' element={<Sessions />} />
        <Route path='/capabilities' element={<Capabilities />} />
        <Route path='/memory' element={<Memory />} />
        <Route path='/approvals' element={<Approvals />} />
      </Route>
    </Routes>
  );
}

export default App;
