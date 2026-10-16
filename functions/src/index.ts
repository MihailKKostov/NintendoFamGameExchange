import * as email from './email.js';

export { acceptInvite, createFamily, declineInvite, deleteFamily, ensureUser, inviteMember, removeMember, revokeInvite, setMemberRole, updateFamily, updateProfile } from './families.js';
export { addToLibrary, removeLibraryItem } from './library.js';
export { cancelLoanRequest, commentOnLoan, lendGame, markLoanReturned, requestLoan, respondToLoan, setLoanDue } from './loans.js';

// Email triggers. SKIP_EMAIL_TRIGGERS=true (local emulator testing only) leaves them out.
const skipEmail = process.env.SKIP_EMAIL_TRIGGERS === 'true';
export const onNotificationCreated = skipEmail ? undefined : email.onNotificationCreated;
export const onInviteCreated = skipEmail ? undefined : email.onInviteCreated;
