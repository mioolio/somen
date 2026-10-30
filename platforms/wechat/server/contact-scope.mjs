/** Boundary: select only the authorized individual contact, never services, self, groups, or guessed names. */
const services = new Set(['filehelper', 'weixin', 'newsapp', 'fmessage', 'medianote', 'qqmail', 'qmessage', 'tmessage', 'floatbottle', 'shakeapp', 'facebookapp', 'feedsapp', 'voiceinputapp', 'notification_messages', 'brandsessionholder']);
export function individualContacts(contacts, accountId) {
  return contacts.filter(contact => contact && typeof contact.id === 'string'
    && /^[A-Za-z][A-Za-z0-9_.:-]{0,255}$/.test(contact.id)
    && contact.id !== accountId && !services.has(contact.id)
    && !contact.id.startsWith('gh_') && !contact.id.endsWith('@chatroom')
    && contact.isGroup !== true && contact.isOfficial !== true);
}
