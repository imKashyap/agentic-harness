import type { TimelineEvent } from '../components/ExecutionTimeline';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: unknown;
    status?: 'running' | 'complete' | 'failed';
    output?: unknown;
  }>;
  subAgents?: Array<{
    id: string;
    task: string;
    status?: 'running' | 'complete';
    response?: string;
  }>;
  recalledMemories?: string[];
  pendingApproval?: {
    approvalToken: string;
    capability: string;
    input: unknown;
  };
}

export interface ChatState {
  messages: ChatMessage[];
  events: TimelineEvent[];
  status: 'idle' | 'running' | 'completed' | 'error';
  selectedEventData?: unknown;
  selectedEventIndex?: number | null;
  activeProgressMessage?: {
    stage: string;
    message: string;
    capability?: string;
    timestamp: number;
  };
  error?: string;
}

export type ChatAction =
  | { type: 'LOAD_HISTORY'; payload: ChatMessage[] }
  | { type: 'USER_SEND'; payload: { message: string } }
  | { type: 'SSE_EVENT'; event: string; data: any }
  | { type: 'SELECT_EVENT'; index: number }
  | { type: 'RESET_CHAT' }
  | { type: 'STOP_RUN' }
  | { type: 'SET_ERROR'; error: string };

export const initialState: ChatState = {
  messages: [],
  events: [],
  status: 'idle',
  selectedEventIndex: null,
  activeProgressMessage: undefined,
};

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'LOAD_HISTORY':
      return {
        ...state,
        messages: action.payload,
        status: 'idle',
      };

    case 'USER_SEND':
      return {
        ...state,
        status: 'running',
        activeProgressMessage: undefined,
        error: undefined,
        messages: [
          ...state.messages,
          { role: 'user', content: action.payload.message },
          { role: 'assistant', content: '', reasoning: '', toolCalls: [], subAgents: [] },
        ],
        events: [
          ...state.events,
          {
            type: 'run:start',
            label: 'Run initiated',
            timestamp: Date.now(),
            data: { input: action.payload.message },
          },
        ],
      };

    case 'SSE_EVENT': {
      const { event, data } = action;

      switch (event) {
        case 'progressive:message': {
          const newTimelineEvent: TimelineEvent = {
            type: 'progressive:message',
            label: data?.message || 'Progress update',
            timestamp: data?.timestamp || Date.now(),
            data,
          };
          return {
            ...state,
            activeProgressMessage: {
              stage: data?.stage || 'action',
              message: data?.message || 'Processing...',
              capability: data?.capability,
              timestamp: data?.timestamp || Date.now(),
            },
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'token:delta': {
          const deltaText = data?.delta || '';
          if (!deltaText) return state;

          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant') {
              return {
                ...msg,
                content: msg.content + deltaText,
              };
            }
            return msg;
          });
          return {
            ...state,
            activeProgressMessage: undefined,
            messages: updatedMessages,
          };
        }


        case 'thought:delta': {
          const deltaText = data?.delta || '';
          if (!deltaText) return state;

          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant') {
              return {
                ...msg,
                reasoning: (msg.reasoning || '') + deltaText,
              };
            }
            return msg;
          });
          return {
            ...state,
            messages: updatedMessages,
          };
        }

        case 'tool:call': {
          const calls = (data?.toolCalls || []).map((tc: any) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
            status: 'running' as const,
          }));

          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant') {
              return {
                ...msg,
                toolCalls: [...(msg.toolCalls || []), ...calls],
              };
            }
            return msg;
          });

          const newTimelineEvent: TimelineEvent = {
            type: 'tool:call',
            label: `Tool called: ${data?.toolCalls?.map((t: any) => t.name).join(', ')}`,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            messages: updatedMessages,
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'task:complete': {
          // Condition-skipped tasks complete with a {skipped: true, reason} marker.
          const isSkipped =
            (data?.output as { skipped?: boolean } | null | undefined)?.skipped === true;

          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant' && msg.toolCalls) {
              return {
                ...msg,
                toolCalls: msg.toolCalls.map((tc) =>
                  tc.id === data?.taskId || tc.name === data?.capability
                    ? { ...tc, status: 'complete' as const, output: data?.output }
                    : tc
                ),
              };
            }
            return msg;
          });

          const newTimelineEvent: TimelineEvent = {
            type: 'task:complete',
            label: isSkipped
              ? `Task skipped (condition not met): ${data?.capability}`
              : `Task completed: ${data?.capability}`,
            status: isSkipped ? 'info' : undefined,
            durationMs: data?.durationMs,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            messages: updatedMessages,
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'task:failed': {
          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant' && msg.toolCalls) {
              return {
                ...msg,
                toolCalls: msg.toolCalls.map((tc) =>
                  tc.id === data?.taskId || tc.name === data?.capability
                    ? { ...tc, status: 'failed' as const, output: data?.error }
                    : tc
                ),
              };
            }
            return msg;
          });

          const newTimelineEvent: TimelineEvent = {
            type: 'task:failed',
            label: `Task failed: ${data?.capability}`,
            durationMs: data?.durationMs,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            messages: updatedMessages,
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'subagent:delegated': {
          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant') {
              return {
                ...msg,
                subAgents: [
                  ...(msg.subAgents || []),
                  { id: data?.subAgentId, task: data?.task, status: 'running' as const },
                ],
              };
            }
            return msg;
          });

          const newTimelineEvent: TimelineEvent = {
            type: 'subagent:delegated',
            label: `Delegated to sub-agent: ${data?.subAgentId}`,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            messages: updatedMessages,
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'subagent:completed': {
          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant' && msg.subAgents) {
              return {
                ...msg,
                subAgents: msg.subAgents.map((sa) =>
                  sa.id === data?.subAgentId
                    ? { ...sa, status: 'complete' as const, response: data?.response }
                    : sa
                ),
              };
            }
            return msg;
          });

          const newTimelineEvent: TimelineEvent = {
            type: 'subagent:completed',
            label: `Sub-agent completed: ${data?.subAgentId}`,
            durationMs: data?.durationMs,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            messages: updatedMessages,
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'memory:recalled': {
          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant') {
              return {
                ...msg,
                recalledMemories: [
                  ...(msg.recalledMemories || []),
                  `Recalled ${data?.matchCount} memory items for: "${data?.query}"`,
                ],
              };
            }
            return msg;
          });

          const newTimelineEvent: TimelineEvent = {
            type: 'memory:recalled',
            label: `Memory recalled (${data?.matchCount} matches)`,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            messages: updatedMessages,
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'hitl:approval_required': {
          const updatedMessages = state.messages.map((msg, i) => {
            if (i === state.messages.length - 1 && msg.role === 'assistant') {
              return {
                ...msg,
                pendingApproval: {
                  approvalToken: data?.approvalToken,
                  capability: data?.capability,
                  input: data?.input,
                },
              };
            }
            return msg;
          });

          const newTimelineEvent: TimelineEvent = {
            type: 'hitl:approval_required',
            label: `Approval required for: ${data?.capability}`,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            messages: updatedMessages,
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'run:end': {
          const newTimelineEvent: TimelineEvent = {
            type: 'run:end',
            label: `Run finished (${data?.durationMs || 0}ms)`,
            durationMs: data?.durationMs,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            status: 'completed',
            activeProgressMessage: undefined,
            events: [...state.events, newTimelineEvent],
          };
        }

        case 'run:error': {
          const newTimelineEvent: TimelineEvent = {
            type: 'run:error',
            label: `Error: ${data?.error || 'Execution failed'}`,
            timestamp: Date.now(),
            data,
          };

          return {
            ...state,
            status: 'error',
            error: data?.error || 'Unknown error occurred during agent run',
            activeProgressMessage: undefined,
            events: [...state.events, newTimelineEvent],
          };
        }

        default:
          return state;
      }
    }

    case 'SELECT_EVENT': {
      const event = state.events[action.index];
      return {
        ...state,
        selectedEventIndex: action.index,
        selectedEventData: event?.data ?? event,
      };
    }

    case 'RESET_CHAT':
      return initialState;

    case 'STOP_RUN':
      return {
        ...state,
        status: 'idle',
        activeProgressMessage: undefined,
      };

    case 'SET_ERROR':
      return {
        ...state,
        status: 'error',
        error: action.error,
      };

    default:
      return state;
  }
}