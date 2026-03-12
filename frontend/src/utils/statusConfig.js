export const STATUS_ORDER = ['NEW','ASSESS','AUTHORIZE','SCHEDULED','IMPLEMENT','REVIEW','CLOSED','CANCELLED'];

export const STATUS_CONFIG = {
  NEW:        { label: 'New',        color: '#555f6e', bg: '#f0f2f4' },
  ASSESS:     { label: 'Assess',     color: '#b45309', bg: '#fef3c7' },
  AUTHORIZE:  { label: 'Authorize',  color: '#6c3483', bg: '#f5eef8' },
  SCHEDULED:  { label: 'Scheduled',  color: '#1565c0', bg: '#e8f0fe' },
  IMPLEMENT:  { label: 'Implement',  color: '#145a32', bg: '#d5f5e3' },
  REVIEW:     { label: 'Review',     color: '#d35400', bg: '#fdebd0' },
  CLOSED:     { label: 'Closed',     color: '#27ae60', bg: '#eafaf1' },
  CANCELLED:  { label: 'Cancelled',  color: '#c0392b', bg: '#fdedec' },
};

export const VALID_TRANSITIONS = {
  NEW: ['ASSESS', 'CANCELLED'],
  ASSESS: ['AUTHORIZE', 'CANCELLED'],
  AUTHORIZE: ['SCHEDULED', 'ASSESS', 'CANCELLED'],
  SCHEDULED: ['IMPLEMENT', 'CANCELLED'],
  IMPLEMENT: ['REVIEW', 'CANCELLED'],
  REVIEW: ['CLOSED', 'IMPLEMENT'],
  CLOSED: [],
  CANCELLED: [],
};

export const PRIORITY_CONFIG = {
  '1': { label: '1 - Critical', color: '#c0392b' },
  '2': { label: '2 - High',     color: '#d35400' },
  '3': { label: '3 - Moderate', color: '#b45309' },
  '4': { label: '4 - Low',      color: '#27ae60' },
};
