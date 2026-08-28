import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Bot,
  Wrench,
  BrainCircuit,
  CheckSquare,
  MessageSquare,
  Activity,
  Sparkles,
} from 'lucide-react';
import { getApprovals } from '../../api/approvals';
import { getHealth } from '../../api/health';

export const Sidebar = () => {
  const { data: approvals } = useQuery({
    queryKey: ['approvals'],
    queryFn: getApprovals,
    refetchInterval: 5000,
  });

  const { data: health, isSuccess } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 10000,
    retry: 1,
  });

  const pendingCount = approvals?.pending?.length || 0;

  const navItems = [
    { name: 'Overview', path: '/', icon: LayoutDashboard },
    { name: 'Agents Playground', path: '/agents', icon: Bot },
    { name: 'Sessions & History', path: '/sessions', icon: MessageSquare },
    { name: 'Long-Term Memory', path: '/memory', icon: BrainCircuit },
    {
      name: 'HITL Approvals',
      path: '/approvals',
      icon: CheckSquare,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    { name: 'Capabilities Catalog', path: '/capabilities', icon: Wrench },
  ];

  return (
    <aside className='w-64 border-r border-neutral-800/80 bg-neutral-950/90 backdrop-blur-md flex flex-col justify-between shrink-0 h-screen'>
      <div>
        {/* Brand Header */}
        <div className='p-5 border-b border-neutral-800/60'>
          <div className='flex items-center gap-2.5'>
            <div className='w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20'>
              <Sparkles size={18} className='text-white' />
            </div>
            <div>
              <div className='font-bold text-sm text-neutral-100 tracking-tight'>
                Agentic Harness
              </div>
              <div className='text-[10px] text-neutral-400 font-mono'>v0.1.0 • Enterprise</div>
            </div>
          </div>
        </div>

        {/* Navigation links */}
        <nav className='p-3 space-y-1'>
          <div className='px-3 py-1.5 text-[10px] font-semibold tracking-wider text-neutral-400 uppercase font-mono'>
            Navigation
          </div>
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-neutral-800/90 text-white shadow-sm border border-neutral-700/60'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
                }`
              }
            >
              <div className='flex items-center gap-2.5'>
                <item.icon size={16} />
                <span>{item.name}</span>
              </div>
              {item.badge !== undefined && (
                <span className='px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'>
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Backend Status Footer */}
      <div className='p-3.5 m-3 rounded-xl border border-neutral-800/80 bg-neutral-900/40 text-xs'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <span
              className={`w-2 h-2 rounded-full ${
                isSuccess ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
              }`}
            />
            <span className='text-[11px] font-medium text-neutral-300'>
              {isSuccess ? 'API Server Live' : 'API Connecting...'}
            </span>
          </div>
          <Activity size={13} className='text-neutral-400' />
        </div>
        {health?.uptime !== undefined && (
          <div className='mt-1.5 text-[10px] text-neutral-400 font-mono'>
            Uptime: {Math.floor(health.uptime)}s • Port: 3000
          </div>
        )}
      </div>
    </aside>
  );
};
