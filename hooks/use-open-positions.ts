'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DerivWS } from '@deriv/core';

export interface OpenPosition {
  contract_id: number;
  contract_type: string;
  buy_price: string;
  bid_price: string;
  payout: string;
  profit: string;
  profit_percentage: number;
  longcode: string;
  underlying_symbol: string;
  barrier?: string;
  currency: string;
  date_start: number;
  date_expiry: number;
  status: string;
  is_expired: number;
  is_sold: number;
  is_valid_to_sell: number;
  tick_count: number;
  tick_stream?: Array<{ epoch: number; tick: number; tick_display_value: string }>;
  entry_spot?: number;
  entry_tick_time?: number;
  current_spot_time?: number;
  exit_spot?: number;
  exit_spot_time?: number;
}

export interface TradeEvent {
  type: 'open' | 'won' | 'lost';
  contract_id: number;
  profit?: number;
}

const CLOSED_POSITION_TTL_MS = 1500;

export function useOpenPositions(
  ws: DerivWS | null,
  isConnected: boolean,
  isAuthenticated: boolean,
  onTradeEvent?: (event: TradeEvent) => void
) {
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const removalTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const isSubscribedRef = useRef(false);

  const scheduleRemoval = useCallback((contractId: number) => {
    const existing = removalTimers.current.get(contractId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      setPositions((prev) => prev.filter((p) => p.contract_id !== contractId));
      removalTimers.current.delete(contractId);
    }, CLOSED_POSITION_TTL_MS);

    removalTimers.current.set(contractId, timer);
  }, []);

  useEffect(() => {
    if (!ws || !isConnected || !isAuthenticated) {
      setPositions([]);
      return;
    }

    const timers = removalTimers.current;
    let prevIds = new Set<number>();

    const unsubscribe = ws.onMessage((data) => {
      if (data.msg_type !== 'proposal_open_contract') return;

      const contract = data.proposal_open_contract as OpenPosition;
      if (!contract) return;

      const isClosed =
        !!contract.is_sold ||
        !!contract.is_expired ||
        contract.status !== 'open';

      const contractId = contract.contract_id;

      setPositions((prev) => {
        const map = new Map(prev.map((p) => [p.contract_id, p]));
        map.set(contractId, contract);
        return Array.from(map.values());
      });

      // 🔥 OPEN EVENT
      if (!prevIds.has(contractId) && !isClosed) {
        onTradeEvent?.({
          type: 'open',
          contract_id: contractId,
        });
      }

      prevIds.add(contractId);

      // 🔥 WIN/LOSS EVENT
      if (isClosed) {
        const profit = Number(contract.profit);

        onTradeEvent?.({
          type: profit >= 0 ? 'won' : 'lost',
          contract_id: contractId,
          profit,
        });

        scheduleRemoval(contractId);
      }
    });

    ws.send({ proposal_open_contract: 1, subscribe: 1 })
      .then(() => {
        isSubscribedRef.current = true;
      })
      .catch(() => {});

    return () => {
      unsubscribe();

      timers.forEach((t) => clearTimeout(t));
      timers.clear();

      setPositions([]);

      if (isSubscribedRef.current && ws.isConnected) {
        ws.send({ forget_all: 'proposal_open_contract' }).catch(() => {});
      }

      isSubscribedRef.current = false;
    };
  }, [ws, isConnected, isAuthenticated, onTradeEvent]);

  return { positions };
}
