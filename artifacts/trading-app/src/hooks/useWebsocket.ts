import { useEffect, useState, useRef } from 'react';
import type { Candle } from '@workspace/api-client-react';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export function useWebsocket(symbol: string, interval: string) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastCandle, setLastCandle] = useState<Candle | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    let isSubscribed = true;

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }

      setStatus('connecting');
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/api/ws/candles`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isSubscribed) return;
        setStatus('connected');
        reconnectAttemptsRef.current = 0;
        ws.send(JSON.stringify({ type: 'subscribe', symbol, interval }));
      };

      ws.onmessage = (event) => {
        if (!isSubscribed) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'candle' && data.symbol === symbol && data.interval === interval) {
            setLastCandle(data.candle);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (!isSubscribed) return;
        setStatus('disconnected');
        const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, timeout);
      };

      ws.onerror = () => {
        if (!isSubscribed) return;
        setStatus('disconnected');
      };
    };

    connect();

    return () => {
      isSubscribed = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [symbol, interval]);

  return { status, lastCandle };
}
