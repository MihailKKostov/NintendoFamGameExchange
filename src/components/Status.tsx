import { CircleCheck, Clock, Hourglass, Package, Ban, Undo2, House, Lock, Repeat } from 'lucide-react';
import type { CopyState } from '../lib/library';
import type { LoanStatus } from '../types';
import { Pill } from './ui';

export function LoanStatusPill({ status }: { status: LoanStatus }) {
  switch (status) {
    case 'pending':
      return <Pill tone="amber" icon={<Hourglass size={14} />}>Pending</Pill>;
    case 'active':
      return <Pill tone="cyan" icon={<Repeat size={14} />}>On loan</Pill>;
    case 'returned':
      return <Pill tone="green" icon={<Undo2 size={14} />}>Returned</Pill>;
    case 'declined':
      return <Pill tone="neutral" icon={<Ban size={14} />}>Declined</Pill>;
    case 'cancelled':
      return <Pill tone="neutral" icon={<Ban size={14} />}>Cancelled</Pill>;
  }
}

export function CopyStatePill({ state }: { state: CopyState }) {
  switch (state) {
    case 'available':
      return <Pill tone="green" icon={<CircleCheck size={14} />}>Available</Pill>;
    case 'on_loan':
      return <Pill tone="cyan" icon={<Package size={14} />}>On loan</Pill>;
    case 'requested':
      return <Pill tone="amber" icon={<Clock size={14} />}>Requested</Pill>;
    case 'borrowed':
      return <Pill tone="purple" icon={<Package size={14} />}>You have it</Pill>;
    case 'mine':
      return <Pill tone="neutral" icon={<House size={14} />}>Yours</Pill>;
    case 'mine_lent':
      return <Pill tone="cyan" icon={<Repeat size={14} />}>Lent out</Pill>;
    case 'unavailable':
      return <Pill tone="neutral" icon={<Lock size={14} />}>Not lending</Pill>;
  }
}
