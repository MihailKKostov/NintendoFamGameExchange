export function notificationText(kind: string, actor: string, game: string): string {
  switch (kind) {
    case 'loan_requested':
      return `${actor} would like to borrow ${game}`;
    case 'loan_accepted':
      return `${actor} accepted your request for ${game}`;
    case 'loan_declined':
      return `${actor} declined your request for ${game}`;
    case 'loan_cancelled':
      return `${actor} cancelled the request for ${game}`;
    case 'loan_lent':
      return `${actor} lent you ${game}`;
    case 'loan_returned':
      return `${actor} marked ${game} as returned`;
    case 'loan_comment':
      return `${actor} commented on ${game}`;
    case 'loan_due_changed':
      return `${actor} changed the due date for ${game}`;
    default:
      return `${actor} updated ${game}`;
  }
}
