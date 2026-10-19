// web/src/useWebSocket.js
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useWebSocket(isAuthenticated, onAuthFailed) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  // Store callbacks and queryClient in refs so they NEVER trigger effect re-execution
  const onAuthFailedRef = useRef(onAuthFailed);
  onAuthFailedRef.current = onAuthFailed;

  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  const reconnectTimeoutRef = useRef(null);
  const backoffRef = useRef(800);
  const lastListInvalidateRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsConnected(false);
      return;
    }

    let ws = null;
    let isUnmounted = false;
    let pingInterval = null;

    function connect() {
      if (isUnmounted) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (isUnmounted) return;
          setIsConnected(true);
          backoffRef.current = 800;
          // Invalidate active queries on reconnect
          queryClientRef.current.invalidateQueries({ queryKey: ['workItems'] });
          queryClientRef.current.invalidateQueries({ queryKey: ['overviewSummary'] });

          // Start client keepalive ping every 15s to keep proxy & TCP stream active
          if (pingInterval) clearInterval(pingInterval);
          pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({ type: 'ping' }));
              } catch {}
            }
          }, 15000);
        };

        ws.onmessage = (event) => {
          try {
            const hint = JSON.parse(event.data);

            if (hint.type === 'heartbeat') {
              // Server keepalive heartbeat: connection is healthy
              return;
            }

            if (hint.type === 'item') {
              const cachedItem = queryClientRef.current.getQueryData(['workItem', String(hint.item_id)]);
              const isNewer =
                !cachedItem ||
                hint.is_attachment_change ||
                hint.version > cachedItem.version ||
                (hint.version === cachedItem.version && hint.event_seq > cachedItem.event_seq);

              if (isNewer) {
                queryClientRef.current.invalidateQueries({ queryKey: ['workItem', String(hint.item_id)] });
                queryClientRef.current.invalidateQueries({ queryKey: ['attachments', String(hint.item_id)] });
                queryClientRef.current.invalidateQueries({ queryKey: ['workItemEvents', String(hint.item_id)] });
              }

              // Dispatch real-time live change event so active viewers/assignees see pop-up notifications
              if (typeof window !== 'undefined' && hint.actor_name) {
                window.dispatchEvent(
                  new CustomEvent('operations_live_item_change', {
                    detail: {
                      item_id: hint.item_id,
                      actor_id: hint.actor_id,
                      actor_name: hint.actor_name,
                      changed_fields: hint.changed_fields || [],
                      version: hint.version
                    }
                  })
                );
              }

              // Throttle list and summary refetch: at most once per 5s
              const now = Date.now();
              if (now - lastListInvalidateRef.current > 5000) {
                lastListInvalidateRef.current = now;
                queryClientRef.current.invalidateQueries({ queryKey: ['workItems'] });
                queryClientRef.current.invalidateQueries({ queryKey: ['overviewSummary'] });
              }
            } else if (hint.type === 'notification') {
              queryClientRef.current.invalidateQueries({ queryKey: ['notifications'] });
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('operations_push_notification', {
                    detail: {
                      type: 'work_item',
                      title: 'Operational Notification',
                      message: 'You have a new update or assignment in your inbox.'
                    }
                  })
                );
              }
            } else if (hint.type === 'membership') {
              queryClientRef.current.invalidateQueries({ queryKey: ['me'] });
              queryClientRef.current.invalidateQueries({ queryKey: ['teamMembers'] });
            } else if (hint.type === 'chat') {
              queryClientRef.current.invalidateQueries({ queryKey: ['teamMessages', String(hint.team_id)] });
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('operations_push_notification', {
                    detail: {
                      type: 'chat',
                      title: 'New Team Message',
                      message: 'A teammate sent a new message in operational chat.',
                      team_id: hint.team_id
                    }
                  })
                );
              }
            } else if (hint.type === 'call') {
              queryClientRef.current.invalidateQueries({ queryKey: ['onCall', String(hint.team_id)] });
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('operations_push_notification', {
                    detail: {
                      type: 'call',
                      title: hint.title || 'War Room Call Scheduled',
                      message: `${hint.creator_name || 'A teammate'} scheduled a ${hint.platform === 'teams' ? 'Microsoft Teams' : 'Google Meet'} call.`,
                      meeting_url: hint.meeting_url
                    }
                  })
                );
              }
            }
          } catch {
            // ignore non-json
          }
        };

        ws.onclose = (event) => {
          if (pingInterval) clearInterval(pingInterval);
          if (isUnmounted) return;
          setIsConnected(false);

          if (event.code === 4401) {
            onAuthFailedRef.current?.();
            return;
          }

          if (event.code === 4403) {
            queryClientRef.current.invalidateQueries({ queryKey: ['me'] });
          }

          // Stable exponential backoff (starts at 800ms, max 15s)
          const delay = Math.min(backoffRef.current, 15000) + Math.random() * 400;
          backoffRef.current = Math.min(backoffRef.current * 1.5, 15000);

          reconnectTimeoutRef.current = setTimeout(connect, delay);
        };

        ws.onerror = () => {
          // Handshake or socket error will trigger onclose
        };
      } catch {
        if (pingInterval) clearInterval(pingInterval);
        setIsConnected(false);
      }
    }

    connect();

    return () => {
      isUnmounted = true;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
    };
  }, [isAuthenticated]);

  return { isConnected };
}
