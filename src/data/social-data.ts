// src/data/social-data.ts
export type SocialItem = {
  id: string;
  label: string;
  icon?: string;   // Font Awesome class (brands/solid)
  link: string;    // full https URL
};

const socials: SocialItem[] = [
  { id: "yt",  label: "YouTube",   icon: "fa-brands fa-youtube",     link: "https://www.youtube.com/@AmritaFashions" },
  { id: "ig",  label: "Instagram", icon: "fa-brands fa-instagram",   link: "https://www.instagram.com/amritafashions" },
  { id: "fb",  label: "Facebook",  icon: "fa-brands fa-facebook-f",  link: "https://www.facebook.com/amritafashions" },
  { id: "li",  label: "LinkedIn",  icon: "fa-brands fa-linkedin-in", link: "https://www.linkedin.com/company/amrita-fashions" },
  { id: "x",   label: "X (Twitter)", icon: "fa-brands fa-x-twitter", link: "https://x.com/amritafashions" },
  { id: "wa",  label: "WhatsApp",  icon: "fa-brands fa-whatsapp",    link: "https://wa.me/919925155141" },
  { id: "tg",  label: "Telegram",  icon: "fa-brands fa-telegram",    link: "https://t.me/amritafashions" },
  { id: "pi",  label: "Pinterest", icon: "fa-brands fa-pinterest-p", link: "https://www.pinterest.com/amritafashions" },
  { id: "th",  label: "Threads",   icon: "fa-brands fa-threads",     link: "https://www.threads.net/@amritafashions" },
  { id: "qo",  label: "Quora",     icon: "fa-brands fa-quora",       link: "https://www.quora.com/profile/Amrita-Fashions" }
];

export default socials;
