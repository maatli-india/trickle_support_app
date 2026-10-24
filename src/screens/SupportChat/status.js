import {CheckCircle2, MessageCircle, XCircle} from 'lucide-react-native';
import {workhorse} from '../../constants/colors';
import {humanize} from '../../utils/format';

// SupportThreadStatus → StatusPill `meta` ({label, bg, fg, Icon}), passed via
// StatusPill's `meta` prop rather than forking the component.
export const THREAD_STATUS_META = {
  open: {
    label: 'Open',
    bg: workhorse.warningSurface,
    fg: workhorse.warningInk,
    Icon: MessageCircle,
  },
  resolved: {
    label: 'Resolved',
    bg: workhorse.successSurface,
    fg: workhorse.successInk,
    Icon: CheckCircle2,
  },
  closed: {
    label: 'Closed',
    bg: workhorse.neutralSurface,
    fg: workhorse.neutralInk,
    Icon: XCircle,
  },
};

export const getThreadStatusMeta = status =>
  THREAD_STATUS_META[status] || {
    label: humanize(status) || 'Unknown',
    bg: workhorse.neutralSurface,
    fg: workhorse.neutralInk,
    Icon: null,
  };

export const threadTitle = thread =>
  thread?.reasonLabel || humanize(thread?.reason) || 'Support chat';
