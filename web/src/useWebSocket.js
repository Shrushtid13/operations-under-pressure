// web/src/useWebSocket.js
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useWebSocket(isAuthenticated) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef(null);
  const backoffRef = useRef(1000);
  const lastListInvalidateRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsConnected(false);
      return;
    }

    let ws = null;
    let isUnmounted = false;

    function connect() {
      if (isUnmounted) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setIsConnected(true);
          backoffRef.current = 1000;
          // Invalidate active queries on reconnect to catch up on missed hints
          queryClient.invalidateQueries();
        };

        ws.onmessage = (event) => {
          try {
            const hint = JSON.parse(event.data);

            if (hint.type === 'item') {
              // 1. Check if specific open item is currently cached
              const cachedItem = queryClient.getQueryData(['workItem', String(hint.item_id)]);
              if (cachedItem) {
                // Lexicographical check: (version, event_seq)
                const isNewer =
                  hint.version > cachedItem.version ||
                  (hint.version === cachedItem.version && hint.event_seq > cachedItem.event_seq);

                if (isNewer) {
                  queryClient.invalidateQueries({ queryKey: ['workItem', String(hint.item_id)] });
                  queryClient.invalidateQueries({ queryKey: ['workItemEvents', String(hint.item_id)] });
                }
              }

              // 2. Throttled list and summary invalidation (at most once every 5 seconds)
              const now = Date.now();
              if (now - lastListInvalidateRef.current > 5000) {
                lastListInvalidateRef.current = now;
                queryClient.invalidateQueries({ queryKey: ['workItems'] });
                queryClient.invalidateQueries({ queryKey: ['overviewSummary'] });
              }
            } else if (hint.type === 'notification') {
              queryClient.invalidateQueries({ queryKey: ['notifications'] });
            } else if (hint.type === 'membership') {
              queryClient.invalidateQueries({ queryKey: ['me'] });
              queryClient.invalidateQueries({ queryKey: ['teamMembers'] });
            }
          } catch {
            // ignore non-json
          }
        };

        ws.onclose = (event) => {
          setIsConnected(false);
          // If close code was 4403 (membership changed), refresh user identity
          if (event.code === 4403) {
            queryClient.invalidateQueries({ queryKey: ['me'] });
          }

          if (!isUnmounted) {
            // Exponential backoff with jitter
            const jitter = Math.random() * 1000;
            const delay = Math.min(backoffRef.current * 1.5, 30000) + jitter;
            backoffRef.current = Math.min(backoffRef.current * 1.5, 30000);

            reconnectTimeoutRef.current = setTimeout(connect, delay);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        setIsConnected(false);
      }
    }

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (ws) ws.close();
    };
  }, [isAuthenticated, queryClient]);

  return { isConnected };
}
