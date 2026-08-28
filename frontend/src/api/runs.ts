import { API_BASE_URL, apiFetch } from './client';
import type { MessageItem } from './sessions';

export type SSEHandler = (event: string, data: any) => void;

export interface RunAgentPayload {
  message: string;
  sessionId?: string;
  enableLongTermMemory?: boolean;
}

export interface RunAgentResponse {
  success: boolean;
  response: string;
  sessionId?: string;
  messages: MessageItem[];
}

export async function runAgentSync(
  agentId: string,
  payload: RunAgentPayload
): Promise<RunAgentResponse> {
  return apiFetch<RunAgentResponse>(`/agents/${agentId}/runs`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function streamAgentRun(
  agentId: string,
  payload: RunAgentPayload,
  onEvent: SSEHandler,
  signal?: AbortSignal
): Promise<void> {
  const url = `${API_BASE_URL}/agents/${agentId}/runs`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...payload, stream: true }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Stream failed with HTTP ${response.status}`);
  }

  if (!response.body) throw new Error('No response stream body available');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let currentEvent = 'message';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('event: ')) {
          currentEvent = trimmed.substring(7).trim();
        } else if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.substring(6).trim();
          try {
            const data = JSON.parse(jsonStr);
            onEvent(currentEvent, data);
          } catch (err) {
            console.debug('Failed to parse SSE JSON chunk:', jsonStr, err);
          }
          currentEvent = 'message';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
