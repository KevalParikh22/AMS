// UI translations. English is the base language; Gujarati translations are
// machine-drafted and should be reviewed by a native speaker before real use.
// Add a new language by adding a top-level key and translating the strings —
// any missing key falls back to English automatically.

export const LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'gu', label: 'ગુ' }
];

export const TRANSLATIONS = {
  en: {
    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.attendance': 'Attendance Desk',
    'nav.registration': 'Registration Form',
    'nav.import': 'Excel Import',
    'nav.events': 'Event Management',
    'nav.reports': 'Reports & Exports',
    'nav.admin': 'Admin Control',
    'nav.signOut': 'Sign Out',

    // Login
    'login.subtitle': 'Attendance & Event Portal',
    'login.signIn': 'Sign In',

    // Attendance desk
    'desk.activeEvent': 'Active Event:',
    'desk.searchPlaceholder': 'Search by name, phone number, class/sabha...',
    'desk.swipeToCheckIn': 'Swipe to check-in',
    'desk.present': 'Present',
    'desk.undoCheckIn': 'Undo Check-in',
    'desk.registerNewPerson': 'Register New Person',
    'desk.scanQr': 'Scan QR',
    'desk.scanTitle': 'Scan Participant QR',
    'desk.scanHint': 'Point the camera at a participant QR badge or receipt.',
    'desk.scanManual': 'Or enter the participant ID manually:',
    'desk.scanNotSupported': 'Camera scanning is not supported in this browser — use manual ID entry below.',
    'desk.scanMark': 'Check In',
    'desk.scanClose': 'Close',
    'desk.showMore': 'Show more results',

    // Shared registration form (public)
    'shared.publicEntryForm': 'Public Entry Form',
    'shared.portalSubtitle': 'Attendee Pre-Registration Portal',
    'shared.date': 'Date:',
    'shared.assemblyTime': 'Assembly Time:',
    'shared.registrationClosed': 'Registration Closed',
    'shared.registrationClosedDesc': 'This assembly session has concluded. Forms can no longer be accepted.',
    'shared.fullName': 'Full Name (Attendee) *',
    'shared.fullNamePlaceholder': "Enter candidate's full name",
    'shared.guardianMobile': 'Guardian Mobile Number *',
    'shared.targetSabha': 'Target Sabha Group',
    'shared.guardianDetails': 'Guardian/Parent Name & Contact Details',
    'shared.guardianPlaceholder': 'e.g. Ramesh Patel (Father) - 9822334455',
    'shared.submit': 'Submit Registration',
    'shared.submitting': 'Submitting…',
    'shared.submitFailed': 'Could not submit your registration. Please check your connection and try again — your details have been kept.',
    'shared.registrationNotOpen': 'Registration Not Open Yet',
    'shared.registrationNotOpenDesc': 'This assembly has not been opened for registration yet. Please check back closer to the event.',
    'shared.submitted': 'Registration Submitted',
    'shared.submittedDesc': 'Your request has been sent for queue verification. Show the reference code below to the entry desk.',
    'shared.referenceCode': 'Reference Code:',
    'shared.name': 'Name:',
    'shared.contactPhone': 'Contact Phone:',
    'shared.sabhaScope': 'Sabha Scope:',
    'shared.copyReceipt': 'Copy Confirmation Receipt',
    'shared.receiptCopied': 'Receipt Copied!',
    'shared.qrHint': 'Show this QR code at the entry desk for quick check-in.',
    'shared.invalidLinkTitle': 'Invalid Session Link',
    'shared.invalidLinkDesc': 'The event code provided in the registration path could not be found or has been deleted.',
    'shared.expiredError': 'This registration link has expired as the event assembly is closed.'
  },

  gu: {
    // Navigation
    'nav.dashboard': 'ડેશબોર્ડ',
    'nav.attendance': 'હાજરી ડેસ્ક',
    'nav.registration': 'નોંધણી ફોર્મ',
    'nav.import': 'એક્સેલ આયાત',
    'nav.events': 'કાર્યક્રમ વ્યવસ્થાપન',
    'nav.reports': 'અહેવાલો અને નિકાસ',
    'nav.admin': 'એડમિન નિયંત્રણ',
    'nav.signOut': 'સાઇન આઉટ',

    // Login
    'login.subtitle': 'હાજરી અને કાર્યક્રમ પોર્ટલ',
    'login.signIn': 'સાઇન ઇન કરો',

    // Attendance desk
    'desk.activeEvent': 'સક્રિય કાર્યક્રમ:',
    'desk.searchPlaceholder': 'નામ, ફોન નંબર અથવા સભાથી શોધો...',
    'desk.swipeToCheckIn': 'હાજરી માટે સ્વાઇપ કરો',
    'desk.present': 'હાજર',
    'desk.undoCheckIn': 'હાજરી રદ કરો',
    'desk.registerNewPerson': 'નવી વ્યક્તિ નોંધો',
    'desk.scanQr': 'QR સ્કેન કરો',
    'desk.scanTitle': 'સહભાગીનો QR સ્કેન કરો',
    'desk.scanHint': 'કૅમેરાને સહભાગીના QR બેજ અથવા રસીદ તરફ રાખો.',
    'desk.scanManual': 'અથવા સહભાગી ID જાતે લખો:',
    'desk.scanNotSupported': 'આ બ્રાઉઝરમાં કૅમેરા સ્કેનિંગ ઉપલબ્ધ નથી — નીચે ID જાતે લખો.',
    'desk.scanMark': 'હાજરી નોંધો',
    'desk.scanClose': 'બંધ કરો',
    'desk.showMore': 'વધુ પરિણામો બતાવો',

    // Shared registration form (public)
    'shared.publicEntryForm': 'જાહેર પ્રવેશ ફોર્મ',
    'shared.portalSubtitle': 'ઉપસ્થિતિ પૂર્વ-નોંધણી પોર્ટલ',
    'shared.date': 'તારીખ:',
    'shared.assemblyTime': 'સભાનો સમય:',
    'shared.registrationClosed': 'નોંધણી બંધ છે',
    'shared.registrationClosedDesc': 'આ સભા સમાપ્ત થઈ ગઈ છે. હવે ફોર્મ સ્વીકારી શકાશે નહીં.',
    'shared.fullName': 'પૂરું નામ (ઉપસ્થિત) *',
    'shared.fullNamePlaceholder': 'ઉમેદવારનું પૂરું નામ લખો',
    'shared.guardianMobile': 'વાલીનો મોબાઈલ નંબર *',
    'shared.targetSabha': 'સભા જૂથ',
    'shared.guardianDetails': 'વાલી/માતાપિતાનું નામ અને સંપર્ક વિગતો',
    'shared.guardianPlaceholder': 'દા.ત. રમેશ પટેલ (પિતા) - 9822334455',
    'shared.submit': 'નોંધણી સબમિટ કરો',
    'shared.submitting': 'સબમિટ થઈ રહ્યું છે…',
    'shared.submitFailed': 'તમારી નોંધણી સબમિટ થઈ શકી નથી. કૃપા કરીને તમારું કનેક્શન તપાસીને ફરી પ્રયાસ કરો — તમારી વિગતો સાચવી રાખવામાં આવી છે.',
    'shared.registrationNotOpen': 'નોંધણી હજી શરૂ થઈ નથી',
    'shared.registrationNotOpenDesc': 'આ સભા માટે નોંધણી હજી ખોલવામાં આવી નથી. કૃપા કરીને કાર્યક્રમની નજીક ફરી તપાસો.',
    'shared.submitted': 'નોંધણી સબમિટ થઈ',
    'shared.submittedDesc': 'તમારી વિનંતી ચકાસણી માટે મોકલવામાં આવી છે. નીચેનો સંદર્ભ કોડ પ્રવેશ ડેસ્ક પર બતાવો.',
    'shared.referenceCode': 'સંદર્ભ કોડ:',
    'shared.name': 'નામ:',
    'shared.contactPhone': 'સંપર્ક ફોન:',
    'shared.sabhaScope': 'સભા જૂથ:',
    'shared.copyReceipt': 'પુષ્ટિની રસીદ કૉપિ કરો',
    'shared.receiptCopied': 'રસીદ કૉપિ થઈ!',
    'shared.qrHint': 'ઝડપી હાજરી માટે આ QR કોડ પ્રવેશ ડેસ્ક પર બતાવો.',
    'shared.invalidLinkTitle': 'અમાન્ય સત્ર લિંક',
    'shared.invalidLinkDesc': 'નોંધણી લિંકમાં આપેલો કાર્યક્રમ કોડ મળ્યો નથી અથવા કાઢી નાખવામાં આવ્યો છે.',
    'shared.expiredError': 'સભા બંધ થઈ જવાથી આ નોંધણી લિંકની મુદત પૂરી થઈ ગઈ છે.'
  }
};
