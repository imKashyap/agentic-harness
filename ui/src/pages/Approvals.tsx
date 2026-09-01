import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckSquare,
  ShieldAlert,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { getApprovals, approveCheckpoint, rejectCheckpoint } from '../api/approvals';
import type { PendingApproval } from '../api/approvals';
import { JsonViewer } from '../components/JsonViewer';

export const Approvals = () => {
  const queryClient = useQueryClient();
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [reasonInput, setReasonInput] = useState('');
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['approvals'],
    queryFn: getApprovals,
    refetchInterval: 3000,
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      return approveCheckpoint(id, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      closeModal();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      return rejectCheckpoint(id, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      closeModal();
    },
  });

  const openModal = (app: PendingApproval, type: 'approve' | 'reject') => {
    setSelectedApproval(app);
    setActionType(type);
    setReasonInput('');
  };

  const closeModal = () => {
    setSelectedApproval(null);
    setActionType(null);
    setReasonInput('');
  };

  const handleConfirmAction = () => {
    if (!selectedApproval || !actionType) return;
    if (actionType === 'approve') {
      approveMutation.mutate({ id: selectedApproval.id, reason: reasonInput });
    } else {
      rejectMutation.mutate({ id: selectedApproval.id, reason: reasonInput });
    }
  };

  if (isLoading) {
    return (
      <div className='flex items-center justify-center h-full text-xs text-neutral-400'>
        Checking for pending approval checkpoints...
      </div>
    );
  }

  if (error) {
    return (
      <div className='p-8 text-xs text-rose-400'>
        Error fetching approvals: {(error as Error).message}
      </div>
    );
  }

  const pending = data?.pending || [];

  return (
    <div className='flex-1 overflow-y-auto p-8 space-y-6 max-w-7xl mx-auto w-full'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-white flex items-center gap-2.5'>
            <CheckSquare size={24} className='text-amber-400' />
            Human-in-the-Loop Governance
          </h1>
          <p className='text-xs text-neutral-400 mt-1'>
            Review, audit, approve, or reject sensitive tool actions and destructive execution checkpoints.
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-mono font-medium ${
            pending.length > 0
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
              : 'bg-neutral-900 border border-neutral-800 text-neutral-400'
          }`}
        >
          {pending.length} Pending Actions
        </span>
      </div>

      {pending.length === 0 ? (
        <div className='py-16 text-center text-xs text-neutral-400 border border-dashed border-neutral-800 rounded-2xl space-y-3'>
          <CheckCircle2 size={36} className='mx-auto text-emerald-400 opacity-60' />
          <div className='text-sm font-semibold text-neutral-300'>All Governance Gates Clear</div>
          <div className='text-[11px] text-neutral-400'>
            No sensitive tool executions currently awaiting human review.
          </div>
        </div>
      ) : (
        <div className='space-y-4'>
          {pending.map((app) => (
            <div
              key={app.id}
              className='p-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-4 shadow-lg'
            >
              <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                <div className='space-y-1'>
                  <div className='flex items-center gap-2'>
                    <div className='w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold'>
                      <ShieldAlert size={18} />
                    </div>
                    <div>
                      <h2 className='text-base font-bold text-white font-mono flex items-center gap-2'>
                        <span>{app.capability}</span>
                      </h2>
                      <div className='text-xs text-neutral-400 font-mono'>
                        Checkpoint: <span className='text-neutral-300'>{app.id}</span> • Run:{' '}
                        <span className='text-neutral-300'>{app.runId}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className='flex items-center gap-3 shrink-0'>
                  <button
                    onClick={() => openModal(app, 'reject')}
                    disabled={rejectMutation.isPending || approveMutation.isPending}
                    className='px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 transition-all flex items-center gap-1.5'
                  >
                    <XCircle size={15} />
                    <span>Reject</span>
                  </button>

                  <button
                    onClick={() => openModal(app, 'approve')}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                    className='px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5'
                  >
                    <CheckCircle2 size={15} />
                    <span>Approve & Resume</span>
                  </button>
                </div>
              </div>

              {/* Input Arguments Preview */}
              <div className='pt-2'>
                <div className='text-[11px] font-mono text-neutral-400 mb-1 font-semibold'>
                  Requested Action Payload & Arguments:
                </div>
                <JsonViewer data={app.input} title={`Input for ${app.capability}`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approve / Reject Modal with Reason Input */}
      {selectedApproval && actionType && (
        <div className='fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4'>
          <div className='bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl'>
            <div className='flex items-center gap-2 pb-2 border-b border-neutral-800'>
              {actionType === 'approve' ? (
                <CheckCircle2 size={20} className='text-emerald-400' />
              ) : (
                <XCircle size={20} className='text-rose-400' />
              )}
              <h3 className='font-bold text-sm text-white'>
                {actionType === 'approve' ? 'Approve Tool Execution' : 'Reject Tool Execution'}
              </h3>
            </div>

            <p className='text-xs text-neutral-400 leading-relaxed'>
              {actionType === 'approve'
                ? `You are about to authorize execution of '${selectedApproval.capability}' for run '${selectedApproval.runId}'.`
                : `You are about to cancel execution of '${selectedApproval.capability}'.`}
            </p>

            <div className='space-y-1.5 text-xs'>
              <label className='text-neutral-300 font-medium'>
                Audit Reason / Feedback (Optional)
              </label>
              <textarea
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder={
                  actionType === 'approve'
                    ? 'e.g. Approved by Lead Architect'
                    : 'e.g. Action exceeds permissions threshold'
                }
                rows={3}
                className='w-full bg-neutral-950 border border-neutral-800 focus:border-indigo-500 rounded-xl p-3 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none'
              />
            </div>

            <div className='flex items-center justify-end gap-2 pt-2'>
              <button
                onClick={closeModal}
                className='px-3.5 py-2 rounded-xl text-xs text-neutral-400 hover:text-white bg-neutral-800 transition-colors'
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-md transition-all ${
                  actionType === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {actionType === 'approve'
                  ? approveMutation.isPending
                    ? 'Approving...'
                    : 'Confirm Approval'
                  : rejectMutation.isPending
                  ? 'Rejecting...'
                  : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
