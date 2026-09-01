import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const Layout = () => {
  return (
    <div className='flex h-screen w-screen bg-neutral-950 text-neutral-100 overflow-hidden font-sans'>
      <Sidebar />
      <main className='flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-neutral-950'>
        <Outlet />
      </main>
    </div>
  );
};
