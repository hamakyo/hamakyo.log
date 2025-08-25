// This is your config file, place any global data here.
// You can import this data from anywhere in your site by using the `import` keyword.

type Config = {
  title: string;
  description: string;
  lang: string;
  profile: {
    author: string;
    description?: string;
  },
  settings: {
    paginationSize: number,
  },
}

type SocialLink = {
  icon: string;
  friendlyName: string; // for accessibility
  link: string;
}

export const siteConfig: Config = {
  title: "hamakyo.log",
  description: "Astroで構築されたミニマリストブログテーマ。ブログを始めたい人のための、迅速で簡単なスターターテーマです。",
  lang: "ja",
  profile: {
    author: "hamakyo",
    description: "自己紹介文をここに入力します"
  },
  settings: {
    paginationSize: 10
  }
}

/**
  These are you social media links.
  It uses https://github.com/natemoo-re/astro-icon#readme
  You can find icons @ https://icones.js.org/
*/
export const SOCIAL_LINKS: Array<SocialLink> = [
  {
    icon: "mdi:github",
    friendlyName: "Github",
    link: "https://github.com/hamakyo",
  },
  {
    icon: "mdi:linkedin",
    friendlyName: "LinkedIn",
    link: "https://www.linkedin.com/in/hamakyo",
  },
  {
    icon: "mdi:email",
    friendlyName: "email",
    link: "mailto:contact@hamakyo.dev",
  },
  {
    icon: "mdi:rss",
    friendlyName: "rss",
    link: "/rss.xml"
  }
];

export const NAV_LINKS: Array<{ title: string, path: string }> = [
    { title: "Home", path: "/" },
    { title: "About", path: "/about" },
    { title: "Blog", path: "/blog" },
    { title: "Archive", path: "/archive" },
];