// Getting in touch (R79): the address for defects and requests, and the
// mailto link Settings shows, which opens the phone's Mail app with the
// subject and a body already holding what a report needs: the app's version
// and the device it runs on. Pure: Settings passes in what it reads from the
// browser, so this can be tested with any user agent.
//
// The sender sees the body before sending and can change or delete any of it.

export const CONTACT_EMAIL = 'chris@micjaunt.app';

// What the browser says about itself, as one readable line: platform and OS
// version, browser, whether the app runs from the Home Screen or in a browser
// tab, and the screen size (an iPhone names its model only as "iPhone", so the
// size is the closest thing to a model).
//
//   deviceLine({ userAgent, installed: true, width: 390, height: 844 })
//   → 'iPhone, iOS 17.6, Safari, Home Screen app, 390×844'
export function deviceLine({ userAgent = '', installed = false, width, height } = {}) {
  const parts = [platform(userAgent), browser(userAgent), installed ? 'Home Screen app' : 'browser'];
  if (width && height) parts.push(`${width}×${height}`);
  return parts.filter(Boolean).join(', ');
}

function platform(ua) {
  let m;
  if ((m = ua.match(/(iPhone|iPad|iPod)[^)]*? OS (\d+)_(\d+)/))) return `${m[1]}, iOS ${m[2]}.${m[3]}`;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone, iOS';
  if ((m = ua.match(/Android (\d+(?:\.\d+)?)(?:;\s*([^;)]+?)(?: Build\/[^;)]*)?)?[;)]/))) {
    const model = m[2] && m[2] !== 'K' ? `, ${m[2].trim()}` : '';
    return `Android ${m[1]}${model}`;
  }
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/.test(ua)) return 'Mac';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return '';
}

// Brand first, since every mobile browser also claims to be Safari.
function browser(ua) {
  if (/Edg(e|iOS|A)?\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Firefox\/|FxiOS/.test(ua)) return 'Firefox';
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/CriOS|Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return '';
}

// The subject line: the app and its version, so reports sort by release.
export function contactSubject(version) {
  return `Mic Jaunt ${version}`;
}

// The body: a place to write, then the version and device lines.
export function contactBody({ version, device }) {
  return `What happened:\n\n\n\nMic Jaunt ${version}\n${device}`;
}

// The whole mailto: URL for the link.
export function contactMailto({ version, device, email = CONTACT_EMAIL }) {
  const subject = encodeURIComponent(contactSubject(version));
  const body = encodeURIComponent(contactBody({ version, device }));
  return `mailto:${email}?subject=${subject}&body=${body}`;
}
