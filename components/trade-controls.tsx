'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import type {
  ContractMode,
  TradeType,
  DurationLimits,
  ProposalInfo,
  BuyResult,
} from '../lib/types';

/* ---------------- LIVE TRADE EVENT (FROM HOOK) ---------------- */
export interface TradeEvent {
  type: 'open' | 'won' | 'lost';
  contract_id: number;
  profit?: number;
  sessionPnL?: number;
  winRate?: number;
  winStreak?: number;
  lossStreak?: number;
}

interface TradeControlsProps {
  tradeType: TradeType;
  contractMode: ContractMode;
  onContractModeChange: (mode: ContractMode) => void;

  selectedDigit: number;
  isConnected: boolean;

  stake: string;
  onStakeChange: (value: string) => void;

  duration: number;
  onDurationChange: (value: number) => void;

  durationLimits: DurationLimits;

  proposal: ProposalInfo | null;
  isProposalLoading: boolean;

  onBuy: () => void;
  isBuying: boolean;

  buyResult: BuyResult | null;
  buyError: string | null;
  onClearBuyResult: () => void;

  isAuthenticated?: boolean;

  /* 🔥 NEW */
  tradeEvent?: TradeEvent;
}

/* ---------------- CONTRACT OPTIONS ---------------- */

const CONTRACT_MODE_OPTIONS: Record<
  TradeType,
  { value: ContractMode; label: string }[]
> = {
  'matches-differs': [
    { value: 'DIGITMATCH', label: 'Matches' },
    { value: 'DIGITDIFF', label: 'Differs' },
  ],
  'over-under': [
    { value: 'DIGITOVER', label: 'Over' },
    { value: 'DIGITUNDER', label: 'Under' },
  ],
  'even-odd': [
    { value: 'DIGITEVEN', label: 'Even' },
    { value: 'DIGITODD', label: 'Odd' },
  ],
};

/* ---------------- HELPERS ---------------- */

function getPredictionText(contractMode: ContractMode): string {
  switch (contractMode) {
    case 'DIGITMATCH':
      return 'match';
    case 'DIGITDIFF':
      return 'differ from';
    case 'DIGITOVER':
      return 'be over';
    case 'DIGITUNDER':
      return 'be under';
    case 'DIGITEVEN':
      return 'be even';
    case 'DIGITODD':
      return 'be odd';
  }
}

function showDigitInPrediction(contractMode: ContractMode): boolean {
  return contractMode !== 'DIGITEVEN' && contractMode !== 'DIGITODD';
}

/* ---------------- COMPONENT ---------------- */

export function TradeControls({
  tradeType,
  contractMode,
  onContractModeChange,
  selectedDigit,
  isConnected,
  stake,
  onStakeChange,
  duration,
  onDurationChange,
  durationLimits,
  proposal,
  isProposalLoading,
  onBuy,
  isBuying,
  buyResult,
  buyError,
  onClearBuyResult,
  isAuthenticated,
  tradeEvent,
}: TradeControlsProps) {

  /* ---------------- BUY ERROR ---------------- */
  useEffect(() => {
    if (buyError) {
      toast.error('Purchase Failed', {
        description: buyError,
      });
      onClearBuyResult();
    }
  }, [buyError]);

  /* ---------------- BUY SUCCESS ---------------- */
  useEffect(() => {
    if (buyResult) {
      toast.success('🟡 TRADE OPENED', {
        description: `Buy: ${buyResult.buyPrice.toFixed(
          2
        )} | Payout: ${buyResult.payout.toFixed(2)}`,
      });
      onClearBuyResult();
    }
  }, [buyResult]);

  /* ---------------- LIVE TRADE EVENTS ---------------- */
  useEffect(() => {
    if (!tradeEvent) return;

    if (tradeEvent.type === 'open') {
      toast('🟡 TRADE STARTED', {
        description: `Contract ID: ${tradeEvent.contract_id}`,
      });
    }

    if (tradeEvent.type === 'won') {
      toast.success('🟢 WIN', {
        description: `
Profit: +${tradeEvent.profit?.toFixed(2)} USD
Session P&L: ${tradeEvent.sessionPnL?.toFixed(2) ?? '0.00'}
Win Rate: ${tradeEvent.winRate?.toFixed(1) ?? '0'}%
        `,
      });
    }

    if (tradeEvent.type === 'lost') {
      toast.error('🔴 LOSS', {
        description: `
Loss: ${tradeEvent.profit?.toFixed(2)} USD
Session P&L: ${tradeEvent.sessionPnL?.toFixed(2) ?? '0.00'}
Win Rate: ${tradeEvent.winRate?.toFixed(1) ?? '0'}%
        `,
      });
    }
  }, [tradeEvent]);

  const modeOptions = CONTRACT_MODE_OPTIONS[tradeType];

  return (
    <div className="space-y-3 sm:space-y-4">

      {/* ---------------- CONTRACT MODE ---------------- */}
      <ToggleGroup
        type="single"
        value={contractMode}
        onValueChange={(value) => {
          if (value) onContractModeChange(value as ContractMode);
        }}
        className="w-full gap-0 rounded-full bg-muted p-1"
      >
        {modeOptions.map((opt) => (
          <ToggleGroupItem
            key={opt.value}
            value={opt.value}
            className="flex-1 rounded-full text-sm font-medium text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:font-bold"
          >
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {/* ---------------- INPUTS ---------------- */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Stake</Label>
          <Input
            type="number"
            value={stake}
            onChange={(e) => onStakeChange(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Duration</Label>
          <Input
            type="number"
            value={duration}
            onChange={(e) =>
              onDurationChange(parseInt(e.target.value || '0'))
            }
          />
        </div>
      </div>

      {/* ---------------- PREDICTION ---------------- */}
      <div className="rounded-lg border border-border p-3 bg-muted/20">
        <p className="text-xs text-muted-foreground">Prediction</p>

        <p className="text-sm font-medium">
          Last digit will{' '}
          <span className="text-primary font-bold">
            {getPredictionText(contractMode)}
          </span>

          {showDigitInPrediction(contractMode) && (
            <span className="ml-2 inline-flex w-5 h-5 rounded-full bg-primary text-white items-center justify-center text-xs">
              {selectedDigit}
            </span>
          )}
        </p>

        {proposal && (
          <div className="flex justify-between pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">Payout</span>
            <span className="font-bold">
              {proposal.payout.toFixed(2)} USD
            </span>
          </div>
        )}
      </div>

      {/* ---------------- BUY BUTTON ---------------- */}
      <Button
        className="w-full"
        disabled={!isConnected || !proposal || isBuying}
        onClick={onBuy}
      >
        {isBuying
          ? 'Buying...'
          : proposal
          ? `Buy @ ${proposal.askPrice.toFixed(2)}`
          : 'Buy Contract'}
      </Button>

      {/* ---------------- REPORTS ---------------- */}
      {isAuthenticated && (
        <Button asChild variant="ghost" className="w-full text-sm">
          <Link href="/reports">View positions →</Link>
        </Button>
      )}
    </div>
  );
}
