// The Help screen (R76): a short guide in the app, opened by the Help button
// at the top of Settings. It is stacked on Settings with openScreen, so its
// Back and the back gesture return there (R31), and the gear stays marked
// while it shows. The install banners' How (R65) opens it the same way, at
// the Install card. The full guide is help/index.html on the site; it is not in
// the service worker's cache, so it opens in the browser and needs a
// connection.
import { el, viewEl, closeScreen, icon } from '../ui.js';
import * as dock from '../dock.js';

const titleEl = document.getElementById('view-title');
const CHEVRON_LEFT = ['M15 6l-6 6 6 6'];

// The words, kept short: one idea per line. A line is plain text, or
// [term, rest] for a line that starts with the name of a thing in bold.
const CONCEPTS = [
  ['Songs', 'everything you can sing or want to try.'],
  ['Lists', 'songs grouped any way you like: for a venue, a theme, a night.'],
  ['Tonight\'s set', 'the one list you sing from tonight at this venue.'],
  ['Next time', 'where parked songs wait for your next visit to this venue.'],
];

// Getting it onto the Home Screen (R65). The banners' How opens Help here.
// The labels are the phones' own, as Apple's and Google's help pages gave
// them in November 2026: Safari's default layout in iOS 26 hides Share
// behind ⋯, and Chrome's menu item is "Add to home screen" ("Install app" in
// some versions).
const INSTALL_WHY = [
  'Installed, Mic Jaunt opens full screen, works with no signal, and keeps its data for good.',
  'In a browser tab it is a website: Safari on an iPhone deletes a website\'s data after seven days without a visit, '
    + 'and Chrome can clear it when the phone runs short of room.',
];

const INSTALL_IPHONE = [
  'Open micjaunt.app in Safari.',
  'Tap Share: the square with the arrow, or ⋯ and then Share.',
  'Scroll down, tap “Add to Home Screen”, leave “Open as Web App” on, then tap Add.',
];

const INSTALL_IPHONE_NOTE = 'Do this before you add songs: the Home Screen app keeps its own data, separate from Safari\'s. '
  + 'Songs already in Safari move with a backup: Settings, Backup, Share backup, then Restore from backup in the installed app.';

const INSTALL_ANDROID = [
  'Open micjaunt.app in Chrome.',
  'Tap the three-dot menu.',
  'Tap “Add to home screen” (or “Install app”), then Install.',
];

const INSTALL_ANDROID_NOTE = 'On Android the installed app and Chrome share their data, so nothing needs moving.';

const SCREENS = [
  ['Tonight', 'the venue, tonight\'s set with Up next on top, and what you\'ve sung here today. '
    + 'The field at the bottom finds a song to add.'],
  ['Songs', 'all your songs, with search, filters and sort. The KaraFun catalog, once loaded. Add a song at the end.'],
  ['Lists', 'your lists. Tap one to see and order its songs, or make it tonight\'s set.'],
  ['History', 'what you sang at each venue, by song or by night. Log a sing you forgot. Venues.'],
  ['Settings (the gear)', 'appearance, backup, CSV import and export, the KaraFun catalog, this help.'],
];

const TONIGHT_STEPS = [
  'Pick the venue at the top. Every sing is logged there with today\'s date.',
  'Up next is the first song of tonight\'s set. KJ shows it full screen to hand over. '
    + 'Sang it logs it, takes it off the set and shows the next song to the KJ.',
  'After that: tap a title for the song\'s details. Drag the handle at the left to reorder. '
    + 'Swipe a row left for Park (to this venue\'s Next time list) or Remove.',
  'The Set menu can show another list without changing tonight\'s set. '
    + 'Its songs have + to pull one into tonight\'s set, and a swipe for Remove. Use for tonight makes it tonight\'s set.',
  'Type in the field to add a song to the list shown, from your songs or from KaraFun.',
];

// With no venue yet the venue menu offers "Add a venue…"; it reads
// "Manage venues…" once there is one.
const FIRST_STEPS = [
  ['Settings', 'load the KaraFun catalog if you use KaraFun venues (download the CSV in Safari first). Optional.'],
  ['Songs', 'add a few songs. Add a song, the KaraFun switch, or Import songs from CSV in Settings.'],
  ['Tonight', 'open the venue menu, Add a venue… (later Manage venues…), add your venue, then pick it.'],
  ['Tonight', 'type a title in the field and tap + to put it on tonight\'s set. '
    + 'New list for tonight… in the Set menu starts a fresh dated list.'],
  'After a song, tap Sang it. Before you leave: Settings, Backup.',
];

const TIPS = [
  'A space after a word searches for that whole word: “I ” finds “I Sang Dixie”, not every title with an i.',
  'Pick one on Songs opens a random song from whatever your search and filters leave.',
  'On an iPhone, back up with Share backup, then Save to Files.',
];

function line(entry) {
  return Array.isArray(entry)
    ? el('li', {}, el('strong', { text: entry[0] }), `: ${entry[1]}`)
    : el('li', { text: entry });
}

// A card with its heading; the heading names the section for screen readers.
function section(id, heading, ...content) {
  return el('section', { class: 'card stack help-card', 'aria-labelledby': id },
    el('h3', { id, text: heading }), ...content);
}

// `scrollTo` is a card's heading id ('help-install'): that card is scrolled
// to the top once drawn, for a banner's How. Without it Help opens at the top.
export function renderHelp({ scrollTo = null } = {}) {
  titleEl.textContent = 'Help';
  dock.showingSettings(true); // Help is part of Settings: the gear stays the selected one
  viewEl.replaceChildren(el('div', { class: 'stack help-view' },
    el('button', { class: 'back', type: 'button', 'aria-label': 'Back to Settings', onclick: () => closeScreen() },
      icon(CHEVRON_LEFT, { size: 20 }), 'Settings'),
    el('h2', { text: 'Help' }),
    section('help-for', 'What it\'s for',
      el('p', {
        text: 'You sing at different venues. Mic Jaunt remembers what you sang where and when, '
          + 'so you don\'t repeat yourself and can build a set for each night.',
      }),
      el('ul', {}, ...CONCEPTS.map(line))),
    section('help-install', 'Put it on your Home Screen',
      ...INSTALL_WHY.map((text) => el('p', { text })),
      el('h4', { text: 'iPhone' }),
      el('ol', {}, ...INSTALL_IPHONE.map(line)),
      el('p', { text: INSTALL_IPHONE_NOTE }),
      el('h4', { text: 'Android' }),
      el('ol', {}, ...INSTALL_ANDROID.map(line)),
      el('p', { text: INSTALL_ANDROID_NOTE })),
    section('help-screens', 'The screens',
      el('p', { class: 'muted', text: 'On the bar at the bottom.' }),
      el('ul', {}, ...SCREENS.map(line))),
    section('help-tonight', 'Tonight, step by step', el('ol', {}, ...TONIGHT_STEPS.map(line))),
    section('help-first', 'First time here', el('ol', {}, ...FIRST_STEPS.map(line))),
    section('help-tips', 'Tips', el('ul', {}, ...TIPS.map(line))),
    el('div', { class: 'card stack help-card' },
      el('a', { class: 'btn help-guide', href: 'help/', target: '_blank', rel: 'noopener' },
        'Full guide', el('span', { 'aria-hidden': 'true', text: ' ↗' })),
      el('p', { class: 'muted', text: 'Opens in the browser and needs to be online.' }))));
  viewEl.scrollTop = 0;
  if (scrollTo) document.getElementById(scrollTo)?.closest('section')?.scrollIntoView({ block: 'start' });
}
