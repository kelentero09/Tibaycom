/**
 * Interface copy in English and Filipino (conversational Taglish, the way tradespeople actually talk).
 * Scope: navigation, landing page, sign-up / log-in, directory and pricing — the screens that decide
 * whether someone joins. Deeper screens stay in English for now.
 */
export const LOCALES = ['en', 'fil'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = 'lang';
export const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale);

const en = {
  nav: { find: 'Find professionals', pricing: 'Pricing', login: 'Log in', join: 'Join free', language: 'Filipino' },
  footer: {
    tagline: 'The online home of Filipino contractors, architects, engineers and skilled workers.',
    directory: 'Directory',
    pricing: 'Pricing',
    about: 'About',
    contact: 'Contact',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
    rights: 'All rights reserved.',
  },
  home: {
    badge: 'Made for Filipino builders',
    title: 'The online home of Filipino builders.',
    subtitle: 'Tibay gives contractors, architects, engineers and skilled workers a professional profile, a project portfolio and a quotation maker — free to start.',
    ctaPrimary: 'Create your free profile',
    ctaSecondary: 'Find a professional',
    trust: ['Free forever plan', 'No credit card needed', 'Ready in 2 minutes'],
    featuresTitle: 'Built for how you actually work',
    features: [
      { title: 'A portfolio that sells for you', body: 'Show finished projects with photos on your own page. Works beautifully on any phone.' },
      { title: 'Quotations in minutes', body: 'Add materials, labor and services. Totals, discounts and VAT are computed for you. Send a link or a clean PDF.' },
      { title: 'Get found by clients', body: 'Appear in a directory clients can filter by profession, specialization, province and city.' },
      { title: 'Share anywhere', body: 'Download your QR code for calling cards, tarpaulins and vehicles. Share to Facebook in one tap.' },
    ],
    stepsTitle: 'Start in three steps',
    steps: [
      { title: 'Sign up free', body: 'Use your email or your Google account.' },
      { title: 'Add your work', body: 'Upload photos of finished projects straight from your phone.' },
      { title: 'Share and quote', body: 'Send your profile link to clients and reply with a professional quotation.' },
    ],
    browseTitle: 'Looking for someone to build?',
    browseAll: 'Browse all',
    pricingTitle: 'Simple, honest pricing',
    pricingSubtitle: 'Start free. Upgrade only when your business needs more.',
    compare: 'Compare all features',
    finalTitle: 'Your next client is searching right now.',
    finalBody: 'Put your work where they can see it.',
  },
  auth: {
    loginTitle: 'Welcome back',
    loginSubtitle: 'Log in to manage your profile and quotations.',
    registerTitle: 'Create your free profile',
    registerSubtitle: 'Showcase your projects and get found by clients. No credit card needed.',
    google: 'Continue with Google',
    facebook: 'Continue with Facebook',
    or: 'or use your email',
    name: 'Full name',
    email: 'Email',
    password: 'Password',
    passwordHint: 'At least 10 characters.',
    login: 'Log in',
    register: 'Create free account',
    forgot: 'Forgot password?',
    createAccount: 'Create an account',
    haveAccount: 'Already have an account?',
  },
  directory: {
    title: 'Find construction professionals',
    subtitle: 'Contractors, architects, engineers and skilled workers across the Philippines.',
    emptyTitle: 'No professionals match your search',
    emptyBody: 'Try a nearby city, a different profession, or clear the filters.',
  },
  pricing: {
    title: 'Pricing',
    subtitle: 'Start free and stay free as long as you like. Upgrade when you want to show more work and send branded quotations.',
    free: 'Free',
    freeBody: 'Everything you need to be found online.',
    forever: 'forever',
    startFree: 'Start free',
    premium: 'Premium',
    premiumBody: 'More projects, branded quotations, your own look.',
    perMonth: '/ month',
    getPremium: 'Get Premium',
    popular: 'Most popular',
    payNote: 'Pay with GCash, Maya or card. No auto-charge.',
  },
};

export type Dictionary = typeof en;

const fil: Dictionary = {
  nav: { find: 'Maghanap ng gagawa', pricing: 'Presyo', login: 'Mag-log in', join: 'Sumali nang libre', language: 'English' },
  footer: {
    tagline: 'Ang online na tahanan ng mga Pilipinong contractor, arkitekto, engineer at skilled worker.',
    directory: 'Direktoryo',
    pricing: 'Presyo',
    about: 'Tungkol sa amin',
    contact: 'Makipag-ugnayan',
    privacy: 'Patakaran sa Privacy',
    terms: 'Mga Tuntunin',
    rights: 'Lahat ng karapatan ay nakalaan.',
  },
  home: {
    badge: 'Gawa para sa mga Pilipinong builder',
    title: 'Ang online na tahanan ng mga Pilipinong builder.',
    subtitle: 'Sa Tibay, may sarili kang professional profile, portfolio ng mga project at gawaan ng quotation — libre magsimula.',
    ctaPrimary: 'Gumawa ng libreng profile',
    ctaSecondary: 'Maghanap ng gagawa',
    trust: ['May libreng plan habambuhay', 'Walang credit card na kailangan', 'Tapos sa loob ng 2 minuto'],
    featuresTitle: 'Ginawa ayon sa totoong takbo ng trabaho mo',
    features: [
      { title: 'Portfolio na nagbebenta para sa iyo', body: 'Ipakita ang mga natapos mong project na may litrato sa sarili mong page. Maganda sa kahit anong cellphone.' },
      { title: 'Quotation sa loob ng ilang minuto', body: 'Ilagay ang materyales, labor at serbisyo. Kusa nang kinukuwenta ang total, discount at VAT. I-send bilang link o malinis na PDF.' },
      { title: 'Madali kang mahanap ng kliyente', body: 'Lalabas ka sa direktoryo na puwedeng i-filter ayon sa propesyon, espesyalisasyon, probinsya at lungsod.' },
      { title: 'I-share kahit saan', body: 'I-download ang QR code mo para sa calling card, tarpaulin at sasakyan. I-share sa Facebook sa isang pindot.' },
    ],
    stepsTitle: 'Tatlong hakbang lang',
    steps: [
      { title: 'Mag-sign up nang libre', body: 'Gamit ang email mo o ang Google account mo.' },
      { title: 'Ilagay ang mga gawa mo', body: 'Mag-upload ng litrato ng mga natapos na project mula mismo sa cellphone.' },
      { title: 'I-share at mag-quote', body: 'Ipadala ang link ng profile mo sa kliyente at sagutin sila ng professional na quotation.' },
    ],
    browseTitle: 'Naghahanap ng gagawa ng project mo?',
    browseAll: 'Tingnan lahat',
    pricingTitle: 'Simple at tapat na presyo',
    pricingSubtitle: 'Magsimula nang libre. Mag-upgrade lang kapag kailangan na ng negosyo mo.',
    compare: 'Ikumpara ang lahat ng feature',
    finalTitle: 'May kliyenteng naghahanap ngayon mismo.',
    finalBody: 'Ilagay ang gawa mo kung saan nila ito makikita.',
  },
  auth: {
    loginTitle: 'Maligayang pagbabalik',
    loginSubtitle: 'Mag-log in para ayusin ang profile at mga quotation mo.',
    registerTitle: 'Gumawa ng libreng profile',
    registerSubtitle: 'Ipakita ang mga project mo at magpahanap sa mga kliyente. Walang credit card na kailangan.',
    google: 'Magpatuloy gamit ang Google',
    facebook: 'Magpatuloy gamit ang Facebook',
    or: 'o gamitin ang email mo',
    name: 'Buong pangalan',
    email: 'Email',
    password: 'Password',
    passwordHint: 'Hindi bababa sa 10 character.',
    login: 'Mag-log in',
    register: 'Gumawa ng libreng account',
    forgot: 'Nakalimutan ang password?',
    createAccount: 'Gumawa ng account',
    haveAccount: 'May account ka na?',
  },
  directory: {
    title: 'Maghanap ng construction professional',
    subtitle: 'Mga contractor, arkitekto, engineer at skilled worker sa buong Pilipinas.',
    emptyTitle: 'Walang tumugma sa hinahanap mo',
    emptyBody: 'Subukan ang kalapit na lungsod, ibang propesyon, o alisin ang mga filter.',
  },
  pricing: {
    title: 'Presyo',
    subtitle: 'Magsimula nang libre at manatiling libre hangga’t gusto mo. Mag-upgrade kapag gusto mo nang magpakita ng mas maraming gawa at magpadala ng quotation na may sarili mong brand.',
    free: 'Libre',
    freeBody: 'Lahat ng kailangan mo para mahanap online.',
    forever: 'habambuhay',
    startFree: 'Magsimula nang libre',
    premium: 'Premium',
    premiumBody: 'Mas maraming project, quotation na may brand mo, sarili mong itsura.',
    perMonth: '/ buwan',
    getPremium: 'Kunin ang Premium',
    popular: 'Pinakasikat',
    payNote: 'Bayad gamit ang GCash, Maya o card. Walang kusang singil.',
  },
};

const dictionaries: Record<Locale, Dictionary> = { en, fil };
export const getDictionary = (locale: Locale): Dictionary => dictionaries[locale];
