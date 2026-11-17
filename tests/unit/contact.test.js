import { describe, it, expect } from 'vitest';
import {
  CONTACT_EMAIL, deviceLine, contactSubject, contactBody, contactMailto,
} from '../../js/lib/contact.js';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';
const IPHONE_HOME_SCREEN = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36';
const ANDROID_REDUCED = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const ANDROID_SAMSUNG = 'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36';
const WINDOWS_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const LINUX_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0';

describe('deviceLine (R79)', () => {
  it('names an iPhone with its iOS version, the browser, how the app runs and the screen', () => {
    expect(deviceLine({ userAgent: IPHONE_SAFARI, installed: false, width: 390, height: 844 }))
      .toBe('iPhone, iOS 17.6, Safari, browser, 390×844');
    expect(deviceLine({ userAgent: IPHONE_HOME_SCREEN, installed: true, width: 393, height: 852 }))
      .toBe('iPhone, iOS 18.1, Home Screen app, 393×852');
    expect(deviceLine({ userAgent: IPHONE_CHROME, installed: false, width: 390, height: 844 }))
      .toBe('iPhone, iOS 17.5, Chrome, browser, 390×844');
  });

  it('names Android with its version and model where the browser gives one', () => {
    expect(deviceLine({ userAgent: ANDROID_CHROME, installed: true, width: 412, height: 915 }))
      .toBe('Android 14, Pixel 7, Chrome, Home Screen app, 412×915');
    // A reduced user agent says "K" for the model and 10 for the version: no model, then.
    expect(deviceLine({ userAgent: ANDROID_REDUCED, installed: false, width: 412, height: 915 }))
      .toBe('Android 10, Chrome, browser, 412×915');
    expect(deviceLine({ userAgent: ANDROID_SAMSUNG, installed: false, width: 384, height: 854 }))
      .toBe('Android 13, SAMSUNG SM-S918B, Samsung Internet, browser, 384×854');
  });

  it('names a computer by its OS and browser', () => {
    expect(deviceLine({ userAgent: WINDOWS_EDGE, width: 1920, height: 1080 })).toBe('Windows, Edge, browser, 1920×1080');
    expect(deviceLine({ userAgent: MAC_SAFARI, width: 1512, height: 982 })).toBe('Mac, Safari, browser, 1512×982');
    expect(deviceLine({ userAgent: LINUX_FIREFOX, width: 1366, height: 768 })).toBe('Linux, Firefox, browser, 1366×768');
  });

  it('says what it can of an empty or strange user agent', () => {
    expect(deviceLine({ userAgent: '', installed: false })).toBe('browser');
    expect(deviceLine({})).toBe('browser');
    expect(deviceLine({ userAgent: 'Something/1.0', installed: true, width: 100, height: 200 })).toBe('Home Screen app, 100×200');
  });
});

describe('the contact link (R79)', () => {
  it('writes to the site address', () => {
    expect(CONTACT_EMAIL).toBe('chris@micjaunt.app');
    expect(contactMailto({ version: '1.0.66', device: 'iPhone' }).startsWith('mailto:chris@micjaunt.app?')).toBe(true);
  });

  it('puts the app and version in the subject', () => {
    expect(contactSubject('1.0.66')).toBe('Mic Jaunt 1.0.66');
  });

  it('leaves room to write, then gives the version and device', () => {
    expect(contactBody({ version: '1.0.66', device: 'iPhone, iOS 17.6, Safari, browser, 390×844' }))
      .toBe('What happened:\n\n\n\nMic Jaunt 1.0.66\niPhone, iOS 17.6, Safari, browser, 390×844');
  });

  it('encodes the subject and body so Mail reads them back exactly', () => {
    const url = new URL(contactMailto({ version: '1.0.66', device: 'iPhone, iOS 17.6, Safari, browser, 390×844' }));
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe('chris@micjaunt.app');
    expect(url.searchParams.get('subject')).toBe('Mic Jaunt 1.0.66');
    expect(url.searchParams.get('body')).toBe(contactBody({ version: '1.0.66', device: 'iPhone, iOS 17.6, Safari, browser, 390×844' }));
    expect(url.href).not.toMatch(/[\s×&]/.source.replace('&', '')); // no raw spaces, newlines or ×
  });
});
